#!/usr/bin/env python3
"""
Suno Library WAV Downloader
===========================
Downloads your entire Suno library as WAV files and zips them up.
Uses your bearer token from the browser — no browser automation needed.

Usage:
    python suno_wav_downloader.py --token "YOUR_BEARER_TOKEN"
    python suno_wav_downloader.py --token "YOUR_BEARER_TOKEN" --output ./my-suno-library
    python suno_wav_downloader.py --token "YOUR_BEARER_TOKEN" --format mp3   # if you just want MP3s
    python suno_wav_downloader.py --token "YOUR_BEARER_TOKEN" --no-zip       # skip zipping

How to get your bearer token:
    1. Go to suno.com and log in
    2. Open DevTools (F12) → Network tab
    3. Filter for "client" or look for requests to studio-api.suno.ai
    4. Find the Authorization header → copy the token after "Bearer "
    5. Token looks like: eyJhbGciOiJSUzI1NiIs... (long JWT string)
"""

import argparse
import fnmatch
import json
import os
import re
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(1)


# ─── Suno Internal API Endpoints ────────────────────────────────────────────
SUNO_BASE = "https://studio-api-prod.suno.com"
SUNO_CDN = "https://cdn1.suno.ai"

# Library feed — POST endpoint (first page)
FEED_URL = f"{SUNO_BASE}/api/feed/v3"
# Library feed — offset pagination (subsequent pages)
FEED_OFFSET_URL = f"{SUNO_BASE}/api/feed/v3/offset"

# Clip detail
CLIP_URL = f"{SUNO_BASE}/api/clip/{{clip_id}}"

# WAV download trigger — Suno generates WAV on-demand via this endpoint
# The response contains a download_url for the generated WAV
DOWNLOAD_URL = f"{SUNO_BASE}/api/download/clip/{{clip_id}}"


class SunoDownloader:
    def __init__(self, token: str, output_dir: str = "./suno-library",
                 fmt: str = "wav", max_workers: int = 3, delay: float = 1.5,
                 filter_pattern: str = ""):
        self.token = token
        self.output_dir = Path(output_dir)
        self.format = fmt
        self.max_workers = max_workers
        self.delay = delay  # seconds between requests to avoid rate limiting
        self.filter_pattern = filter_pattern.lower() if filter_pattern else ""
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Referer": "https://suno.com/",
            "Origin": "https://suno.com",
        })
        self.stats = {"total": 0, "downloaded": 0, "failed": 0, "skipped": 0}
        self.total_hint = 0
        self.metadata = []

    def verify_token(self) -> bool:
        """Test that the token is valid by hitting the feed endpoint."""
        print("[*] Verifying token...")
        try:
            resp = self.session.post(FEED_URL, json={
                "filters": {
                    "disliked": "False",
                    "trashed": "False",
                    "fromStudioProject": {"presence": "False"}
                }
            }, timeout=15)
            if resp.status_code == 401:
                print("[!] Token is invalid or expired. Get a fresh one from DevTools.")
                return False
            if resp.status_code == 403:
                print("[!] Token is forbidden. Make sure you copied the full JWT.")
                return False
            resp.raise_for_status()
            data = resp.json()

            # Try to detect total count from response
            if isinstance(data, dict):
                self.total_hint = data.get("total", data.get("count", 0))
                if self.total_hint:
                    print(f"[+] Token valid! Library reports {self.total_hint} clips.")
                else:
                    print("[+] Token valid!")
            else:
                print("[+] Token valid!")
            return True
        except requests.RequestException as e:
            print(f"[!] Connection error: {e}")
            return False

    def fetch_library(self) -> list[dict]:
        """Paginate through the entire library using offset-based pagination."""
        print("[*] Fetching library...")
        all_clips = []
        seen_ids = set()
        offset = 0
        batch_size = 20  # Suno's default page size
        base_filters = {
            "disliked": "False",
            "trashed": "False",
            "fromStudioProject": {"presence": "False"}
        }
        max_retries = 3
        empty_pages = 0

        while True:
            payload = {"offset": offset, "filters": base_filters}

            # Try offset endpoint first, fall back to v3 with offset
            endpoints_to_try = []
            if offset == 0:
                endpoints_to_try = [
                    ("v3", FEED_URL),
                    ("v3+offset", FEED_URL),
                    ("offset", FEED_OFFSET_URL),
                ]
            else:
                endpoints_to_try = [
                    ("offset", FEED_OFFSET_URL),
                    ("v3+offset", FEED_URL),
                ]

            data = None
            for label, url in endpoints_to_try:
                try:
                    if label == "v3" and offset == 0:
                        # First page without offset param
                        resp = self.session.post(url, json={"filters": base_filters}, timeout=30)
                    else:
                        resp = self.session.post(url, json=payload, timeout=30)

                    if resp.status_code != 200:
                        print(f"    [{label}] HTTP {resp.status_code} — trying next...")
                        continue

                    data = resp.json()

                    # Check if response has clips
                    test_clips = self._extract_clips(data)
                    if test_clips:
                        # Check if any are new
                        has_new = any(c.get("id") not in seen_ids for c in test_clips if c.get("id"))
                        if has_new:
                            break  # Found new data
                        elif offset > 0:
                            continue  # Try next endpoint
                        else:
                            break  # First page, use whatever we got
                    elif offset > 0:
                        # Empty response — try next endpoint
                        continue

                except requests.RequestException as e:
                    print(f"    [{label}] Error: {e}")
                    continue

            if data is None:
                print(f"    [!] All endpoints failed at offset {offset}")
                break

            clips = self._extract_clips(data)

            if not clips:
                if offset == 0:
                    # First page empty — dump debug
                    self._debug_response(data, offset)
                else:
                    print(f"    --- End of library at offset {offset} ---")
                break

            # Deduplicate
            new_clips = []
            for clip in clips:
                clip_id = clip.get("id", "")
                if clip_id and clip_id not in seen_ids:
                    seen_ids.add(clip_id)
                    new_clips.append(clip)

            if not new_clips:
                empty_pages += 1
                if empty_pages >= 2:
                    print(f"    --- No new clips after {empty_pages} attempts, end of library ---")
                    break
                # Try bumping offset further
                offset += batch_size
                time.sleep(self.delay)
                continue

            empty_pages = 0  # Reset counter

            for clip in new_clips:
                title = clip.get("title", clip.get("name", "Untitled"))
                clip_id = clip.get("id", "???")[:8]
                all_clips.append(clip)
                idx = len(all_clips)
                print(f"    {idx:>4}. {title}  ({clip_id}...)")

            print(f"    --- Offset {offset}: {len(new_clips)} new clips (total: {len(all_clips)}) ---")

            if len(clips) < batch_size:
                break

            offset += len(clips)
            time.sleep(self.delay)

        print(f"[+] Found {len(all_clips)} total clips in library")
        self.stats["total"] = len(all_clips)
        return all_clips

    def _extract_clips(self, data) -> list[dict]:
        """Extract clips from API response, trying multiple known key patterns."""
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ["clips", "data", "songs", "results", "page_clips", "items", "feed"]:
                if key in data and isinstance(data[key], list) and len(data[key]) > 0:
                    return data[key]
            # Maybe the response IS a single clip
            if "id" in data and ("audio_url" in data or "title" in data):
                return [data]
        return []

    def _debug_response(self, data, offset):
        """Print debug info about an API response."""
        if isinstance(data, dict):
            preview = json.dumps(data, indent=2)[:1000]
            print(f"    [DEBUG] No clips at offset {offset}")
            print(f"    [DEBUG] Keys: {list(data.keys())}")
            print(f"    [DEBUG] Response:\n{preview}")
        elif isinstance(data, list):
            print(f"    [DEBUG] Empty list at offset {offset}, len={len(data)}")
        else:
            print(f"    [DEBUG] Unexpected type {type(data)}: {str(data)[:300]}")

    def matches_filter(self, title: str) -> bool:
        """Check if a track title matches the filter pattern."""
        if not self.filter_pattern:
            return True
        return fnmatch.fnmatch(title.lower(), self.filter_pattern)

    def sanitize_filename(self, name: str, clip_id: str) -> str:
        """Create a safe filename from the song title."""
        if not name or name.strip() == "":
            name = "Untitled"
        # Remove invalid filename characters
        name = re.sub(r'[\\/:*?"<>|]', '', name)
        name = re.sub(r'\s+', ' ', name).strip()
        # Truncate to reasonable length and append short ID for uniqueness
        name = name[:80]
        short_id = clip_id[:8] if clip_id else "unknown"
        return f"{name} [{short_id}]"

    def download_wav(self, clip: dict) -> dict | None:
        """
        Download a single clip as WAV.

        Suno generates WAV on-demand. The flow is:
        1. POST/GET to the download endpoint to trigger WAV generation
        2. The response contains a download_url or the WAV data
        3. Download the WAV file from that URL

        Falls back to CDN MP3 download if WAV generation fails.
        """
        clip_id = clip.get("id", "")
        title = clip.get("title", "Untitled")
        safe_name = self.sanitize_filename(title, clip_id)
        ext = self.format
        filepath = self.output_dir / f"{safe_name}.{ext}"

        # Skip if already downloaded
        if filepath.exists():
            print(f"    [SKIP] {safe_name} (already exists)")
            self.stats["skipped"] += 1
            return {"file": str(filepath), "title": title, "id": clip_id, "status": "skipped"}

        wav_url = None

        if self.format == "wav":
            # Method 1: Try the download endpoint that triggers WAV generation
            try:
                download_endpoint = DOWNLOAD_URL.format(clip_id=clip_id)
                resp = self.session.get(download_endpoint, params={"format": "wav"}, timeout=30)

                if resp.status_code == 200:
                    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else None

                    if data:
                        # Response might contain a URL to the generated WAV
                        wav_url = (
                            data.get("download_url") or
                            data.get("url") or
                            data.get("wav_url") or
                            data.get("audio_url")
                        )
                    else:
                        # Response might BE the WAV binary
                        if len(resp.content) > 10000:  # Sanity check — WAV files are large
                            filepath.write_bytes(resp.content)
                            print(f"    [OK]   {safe_name}.wav ({len(resp.content) / 1024 / 1024:.1f} MB)")
                            self.stats["downloaded"] += 1
                            return {"file": str(filepath), "title": title, "id": clip_id, "status": "ok", "format": "wav"}
            except Exception as e:
                print(f"    [WARN] WAV endpoint failed for {safe_name}: {e}")

            # Method 2: Try direct CDN WAV URL (sometimes works for Pro accounts)
            if not wav_url:
                wav_cdn_url = f"{SUNO_CDN}/{clip_id}.wav"
                try:
                    head_resp = self.session.head(wav_cdn_url, timeout=10)
                    if head_resp.status_code == 200:
                        wav_url = wav_cdn_url
                except Exception:
                    pass

            # Method 3: Try the clip detail endpoint for a WAV URL
            if not wav_url:
                try:
                    clip_endpoint = CLIP_URL.format(clip_id=clip_id)
                    resp = self.session.get(clip_endpoint, timeout=15)
                    if resp.status_code == 200:
                        clip_data = resp.json()
                        wav_url = clip_data.get("wav_audio_url") or clip_data.get("download_url")
                except Exception:
                    pass

        # If we have a WAV URL, download it
        if wav_url:
            try:
                resp = self.session.get(wav_url, timeout=120, stream=True)
                resp.raise_for_status()
                with open(filepath, 'wb') as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                size_mb = filepath.stat().st_size / 1024 / 1024
                print(f"    [OK]   {safe_name}.wav ({size_mb:.1f} MB)")
                self.stats["downloaded"] += 1
                return {"file": str(filepath), "title": title, "id": clip_id, "status": "ok", "format": "wav"}
            except Exception as e:
                print(f"    [WARN] WAV download failed for {safe_name}: {e}")

        # Fallback: Download MP3 from CDN (always available)
        mp3_url = clip.get("audio_url") or f"{SUNO_CDN}/{clip_id}.mp3"
        fallback_path = self.output_dir / f"{safe_name}.mp3"

        try:
            resp = self.session.get(mp3_url, timeout=60, stream=True)
            resp.raise_for_status()
            with open(fallback_path, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            size_mb = fallback_path.stat().st_size / 1024 / 1024
            marker = "[MP3]" if self.format == "wav" else "[OK]  "
            print(f"    {marker}  {safe_name}.mp3 ({size_mb:.1f} MB) {'(WAV unavailable)' if self.format == 'wav' else ''}")
            self.stats["downloaded"] += 1
            return {"file": str(fallback_path), "title": title, "id": clip_id, "status": "ok", "format": "mp3"}
        except Exception as e:
            print(f"    [FAIL] {safe_name}: {e}")
            self.stats["failed"] += 1
            return {"file": None, "title": title, "id": clip_id, "status": "failed", "error": str(e)}

    def save_metadata(self, clips: list[dict], results: list[dict]):
        """Save a JSON manifest of all clips with metadata."""
        manifest = {
            "exported_at": datetime.now().isoformat(),
            "total_clips": len(clips),
            "download_stats": self.stats,
            "tracks": []
        }
        for clip, result in zip(clips, results):
            if result is None:
                continue
            track = {
                "id": clip.get("id"),
                "title": clip.get("title"),
                "tags": clip.get("metadata", {}).get("tags", "") if isinstance(clip.get("metadata"), dict) else clip.get("tags", ""),
                "duration": clip.get("duration"),
                "model": clip.get("major_model_version", clip.get("model_name", "")),
                "created_at": clip.get("created_at", ""),
                "audio_url": clip.get("audio_url", ""),
                "image_url": clip.get("image_url", ""),
                "local_file": result.get("file"),
                "download_format": result.get("format", "unknown"),
                "status": result.get("status", "unknown"),
            }
            # Include lyrics if present
            lyrics = clip.get("metadata", {}).get("prompt", "") if isinstance(clip.get("metadata"), dict) else clip.get("prompt", "")
            if lyrics:
                track["lyrics"] = lyrics
            manifest["tracks"].append(track)

        manifest_path = self.output_dir / "manifest.json"
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        print(f"[+] Manifest saved: {manifest_path}")

    def create_zip(self) -> str:
        """Zip all downloaded files into a single archive."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_name = f"suno-library-{timestamp}.zip"
        zip_path = self.output_dir.parent / zip_name

        print(f"[*] Creating ZIP: {zip_path}")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file in self.output_dir.rglob("*"):
                if file.is_file():
                    arcname = file.relative_to(self.output_dir)
                    zf.write(file, arcname)

        size_mb = zip_path.stat().st_size / 1024 / 1024
        print(f"[+] ZIP created: {zip_path} ({size_mb:.1f} MB)")
        return str(zip_path)

    def run(self, create_zip: bool = True):
        """Main execution flow."""
        print("=" * 60)
        print("  Suno Library WAV Downloader")
        print("=" * 60)
        print()

        # Verify token
        if not self.verify_token():
            sys.exit(1)

        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Fetch all clips from library
        all_clips = self.fetch_library()
        if not all_clips:
            print("[!] No clips found in your library.")
            return

        # Apply filter if set
        if self.filter_pattern:
            clips = [c for c in all_clips if self.matches_filter(c.get("title", c.get("name", "")))]
            print(f"\n[*] Filter '{self.filter_pattern}': {len(clips)} of {len(all_clips)} clips match")
            if not clips:
                print("[!] No clips match the filter.")
                return
        else:
            clips = all_clips

        # Download all clips
        print(f"\n[*] Downloading {len(clips)} clips as {self.format.upper()}...\n")
        results = []

        for i, clip in enumerate(clips, 1):
            title = clip.get("title", "Untitled")
            clip_id = clip.get("id", "unknown")
            print(f"  [{i}/{len(clips)}] {title} ({clip_id[:8]}...)")
            result = self.download_wav(clip)
            results.append(result)
            if i < len(clips):
                time.sleep(self.delay)

        # Save manifest
        self.save_metadata(clips, results)

        # Summary
        print()
        print("=" * 60)
        print(f"  Download complete!")
        print(f"  Total:      {self.stats['total']}")
        print(f"  Downloaded: {self.stats['downloaded']}")
        print(f"  Skipped:    {self.stats['skipped']}")
        print(f"  Failed:     {self.stats['failed']}")
        print(f"  Output:     {self.output_dir}")
        print("=" * 60)

        # Create zip
        if create_zip and self.stats["downloaded"] > 0:
            print()
            zip_path = self.create_zip()
            print(f"\n  ZIP file: {zip_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Download your entire Suno library as WAV files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
How to get your bearer token:
  1. Go to suno.com and log in
  2. Open DevTools (F12) → Network tab
  3. Refresh the page and look for requests to studio-api.suno.ai
  4. Click any request → Headers tab → find "Authorization: Bearer ..."
  5. Copy the token (the long string after "Bearer ")

Examples:
  python suno_wav_downloader.py --token "eyJhbG..."
  python suno_wav_downloader.py --token "eyJhbG..." --output ./my-music
  python suno_wav_downloader.py --token "eyJhbG..." --format mp3 --no-zip
  python suno_wav_downloader.py --token "eyJhbG..." --filter "Night*"
  python suno_wav_downloader.py --token "eyJhbG..." --filter "*love*" --format wav
  SUNO_TOKEN=eyJhbG... python suno_wav_downloader.py
        """
    )
    parser.add_argument("--token", "-t",
                        default=os.environ.get("SUNO_TOKEN", ""),
                        help="Suno bearer token (or set SUNO_TOKEN env var)")
    parser.add_argument("--output", "-o",
                        default="./suno-library",
                        help="Output directory (default: ./suno-library)")
    parser.add_argument("--format", "-f",
                        choices=["wav", "mp3"],
                        default="wav",
                        help="Download format (default: wav)")
    parser.add_argument("--delay", "-d",
                        type=float,
                        default=1.5,
                        help="Delay between downloads in seconds (default: 1.5)")
    parser.add_argument("--workers", "-w",
                        type=int,
                        default=1,
                        help="Concurrent downloads (default: 1, keep low to avoid rate limits)")
    parser.add_argument("--no-zip",
                        action="store_true",
                        help="Skip creating ZIP archive")
    parser.add_argument("--filter",
                        default="",
                        help="Filter tracks by title (glob pattern). Examples: 'Night*', '*love*', 'Sitar Soul*'")

    args = parser.parse_args()

    if not args.token:
        print("ERROR: No token provided.")
        print("Use --token 'YOUR_TOKEN' or set SUNO_TOKEN environment variable.")
        print("Run with --help for instructions on getting your token.")
        sys.exit(1)

    downloader = SunoDownloader(
        token=args.token,
        output_dir=args.output,
        fmt=args.format,
        max_workers=args.workers,
        delay=args.delay,
        filter_pattern=args.filter,
    )
    downloader.run(create_zip=not args.no_zip)


if __name__ == "__main__":
    main()
