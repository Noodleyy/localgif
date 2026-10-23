const link = "text-ink underline underline-offset-2";

// the GPL asks to say what the app is built on and where its source is
export function Footer() {
  return (
    <footer className="fade-in pt-2 [animation-delay:0.25s] [animation-duration:0.5s] pb-8 text-center text-xs leading-relaxed text-ink-muted"
    >
      <p>Runs entirely in your browser — your video never leaves your device.</p>
      <p>
        Converts with{" "}
        <a href="https://ffmpeg.org" className={link}>
          FFmpeg
        </a>{" "}
        via{" "}
        <a href="https://github.com/ffmpegwasm/ffmpeg.wasm" className={link}>
          ffmpeg.wasm
        </a>{" "}
        (GPL). This app is free software under the{" "}
        <a href="https://www.gnu.org/licenses/gpl-3.0.html" className={link}>
          GPL-3.0
        </a>
        {process.env.NEXT_PUBLIC_REPO_URL && (
          <>
            {" · "}
            <a href={process.env.NEXT_PUBLIC_REPO_URL} className={link}>
              Source code
            </a>
          </>
        )}
        .
      </p>
    </footer>
  );
}
