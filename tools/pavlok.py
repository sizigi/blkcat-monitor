#!/usr/bin/env python3
"""Pavlok API client - sends stimuli (zap, vibe, beep) to your Pavlok device."""

import json
import os
import sys
import urllib.request
import urllib.error

API_URL = "https://api.pavlok.com/api/v5/stimulus/send"
VALID_TYPES = {"zap", "vibe", "beep"}
DEFAULT_TYPE = "zap"
DEFAULT_INTENSITY = 50


def send_stimulus(stimulus_type: str, intensity: int, token: str) -> dict:
    payload = json.dumps({
        "stimulus": {
            "stimulusType": stimulus_type,
            "stimulusValue": intensity,
        }
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )

    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    token = os.environ.get("PAVLOK_TOKEN")
    if not token:
        print("Error: PAVLOK_TOKEN environment variable is not set.")
        print()
        print("To get your token:")
        print("  1. POST to https://api.pavlok.com/api/v5/users/login")
        print('     with {"email": "you@example.com", "password": "your_password"}')
        print("  2. Copy the token from the response")
        print("  3. Export it: export PAVLOK_TOKEN='your_token_here'")
        sys.exit(1)

    stimulus_type = DEFAULT_TYPE
    intensity = DEFAULT_INTENSITY

    args = sys.argv[1:]

    if len(args) >= 1:
        stimulus_type = args[0].lower()
    if len(args) >= 2:
        try:
            intensity = int(args[1])
        except ValueError:
            print(f"Error: intensity must be a number, got '{args[1]}'")
            print("Usage: pavlok.py [zap|vibe|beep] [1-100]")
            sys.exit(1)

    if stimulus_type not in VALID_TYPES:
        print(f"Error: unknown stimulus type '{stimulus_type}'")
        print(f"Valid types: {', '.join(sorted(VALID_TYPES))}")
        sys.exit(1)

    if not 1 <= intensity <= 100:
        print(f"Error: intensity must be between 1 and 100, got {intensity}")
        sys.exit(1)

    try:
        result = send_stimulus(stimulus_type, intensity, token)
        print(f"Sent {stimulus_type} at intensity {intensity}")
        print(f"Response: {json.dumps(result, indent=2)}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"API error (HTTP {e.code}): {body}")
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Connection error: {e.reason}")
        sys.exit(1)


if __name__ == "__main__":
    main()

