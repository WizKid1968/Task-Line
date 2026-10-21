"""Small, model-agnostic CLI around the official Higgsfield Python SDK."""

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv


def input_object(args):
    if args.input_file:
        source = sys.stdin.read() if args.input_file == "-" else Path(args.input_file).read_text()
    else:
        source = args.input
    try:
        value = json.loads(source)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Input must be valid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError("Model input must be a JSON object.")
    return value


def print_json(value):
    print(json.dumps(value, indent=2, ensure_ascii=False, default=str))


def main():
    parser = argparse.ArgumentParser(
        description="Use any Higgsfield model endpoint with its documented JSON input."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    for name, description in (
        ("run", "Submit a model request and wait for its result"),
        ("submit", "Submit a model request and print its request ID"),
    ):
        command = sub.add_parser(name, help=description)
        command.add_argument("model", help="Exact model endpoint ID from the Higgsfield Console")
        source = command.add_mutually_exclusive_group(required=True)
        source.add_argument("--input", help="JSON object with model-specific parameters")
        source.add_argument("--input-file", help="JSON file path, or - for standard input")
        command.add_argument(
            "--idempotency-key",
            help="Reuse the key printed by an earlier attempt to retry it without a second charge",
        )

    upload = sub.add_parser("upload", help="Upload local media and print its public URL")
    upload.add_argument("file", help="Path to an image, video, or audio file")

    for name, description in (
        ("status", "Check an existing request"),
        ("result", "Wait for an existing request's result"),
        ("cancel", "Cancel a queued request"),
    ):
        command = sub.add_parser(name, help=description)
        command.add_argument("request_id")

    args = parser.parse_args()
    load_dotenv(Path(__file__).with_name(".env"))
    key = os.getenv("HF_KEY")
    separate_key = os.getenv("HF_API_KEY") and os.getenv("HF_API_SECRET")
    if not (key or separate_key) or key == "your-api-key-id:your-api-key-secret":
        parser.error("Set HF_KEY in .env (key-id:key-secret) before using the API.")

    import higgsfield_client

    if args.command in ("run", "submit"):
        # The SDK retries a submit on 5xx/429; one key per intent stops a retry
        # from creating and billing a second generation.
        idempotency_key = args.idempotency_key or str(uuid.uuid4())
        higgsfield_client.sync_client._client.headers["Idempotency-Key"] = idempotency_key
        print(f"Idempotency-Key: {idempotency_key}", file=sys.stderr)

    try:
        if args.command == "run":
            print_json(higgsfield_client.subscribe(
                args.model,
                arguments=input_object(args),
                on_enqueue=lambda request_id: print(f"Request ID: {request_id}", file=sys.stderr),
            ))
        elif args.command == "submit":
            controller = higgsfield_client.submit(args.model, arguments=input_object(args))
            print_json({"request_id": controller.request_id})
        elif args.command == "upload":
            print(higgsfield_client.upload_file(args.file))
        elif args.command == "status":
            status = higgsfield_client.status(request_id=args.request_id)
            names = {
                higgsfield_client.Queued: "queued",
                higgsfield_client.InProgress: "in_progress",
                higgsfield_client.Completed: "completed",
                higgsfield_client.Failed: "failed",
                higgsfield_client.NSFW: "nsfw",
                higgsfield_client.Cancelled: "canceled",
            }
            print_json({"request_id": args.request_id, "status": names[type(status)]})
        elif args.command == "cancel":
            higgsfield_client.cancel(request_id=args.request_id)
            print_json({"request_id": args.request_id, "status": "canceled"})
        else:
            print_json(higgsfield_client.result(request_id=args.request_id))
    except (OSError, ValueError, higgsfield_client.HiggsfieldClientError) as exc:
        parser.exit(2, f"hf: {exc}\n")


if __name__ == "__main__":
    main()
