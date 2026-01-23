import asyncio
import argparse
import json
import base64
import sys
import edge_tts

async def main():
    parser = argparse.ArgumentParser(description='Edge TTS Bridge')
    parser.add_argument('--text', required=True, help='Text to synthesize')
    parser.add_argument('--voice', default='en-US-GuyNeural', help='Voice to use')
    parser.add_argument('--rate', default='+0%', help='Rate adjustment')
    parser.add_argument('--pitch', default='+0Hz', help='Pitch adjustment')
    
    args = parser.parse_args()
    
    # Explicitly request WordBoundary events
    communicate = edge_tts.Communicate(
        text=args.text,
        voice=args.voice,
        rate=args.rate,
        pitch=args.pitch,
        boundary="WordBoundary"
    )
    
    audio_data = bytearray()
    boundaries = []
    
    try:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.extend(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                # Convert the dictionary to maintain structure
                # edge-tts structure: {"offset": int, "duration": int, "text": str}
                boundaries.append(chunk)

        # Output result as JSON
        result = {
            "audio": base64.b64encode(audio_data).decode('utf-8'),
            "boundaries": boundaries
        }
        
        # Print JSON to stdout
        print(json.dumps(result))
        
    except Exception as e:
        # Print error details to stderr for debugging
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
