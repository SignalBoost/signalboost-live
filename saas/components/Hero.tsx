const playAudio = async (src: string, code: string) => {
  if (!audioRef.current) return;

  // Clear previous errors
  audioRef.current.onerror = () => {
    console.error(`Error loading: ${src}. Code: ${audioRef.current?.error?.code}`);
    alert(`File not found at ${src}. Ensure it's in the root public/audio folder.`);
  };

  try {
    audioRef.current.src = src;
    audioRef.current.load();
    await audioRef.current.play();
    setPlayingCode(code);
  } catch (err) {
    console.error("Playback blocked or failed:", err);
  }
};
