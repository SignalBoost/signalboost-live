import urllib.request
import sys

def check_site(url):
    try:
        status = urllib.request.urlopen(url).getcode()
        if status == 200:
            print(f"Success: {url} is up.")
        else:
            print(f"Warning: {url} returned status code {status}.")
            sys.exit(1)
    except Exception as e:
        print(f"Error: Could not reach {url}. Exception: {e}")
        sys.exit(1)

if __name__ == "__main__":
    check_site("https://signalboost-live.vercel.app/")
