import { motion } from "framer-motion";

const link = "text-ink underline underline-offset-2";

// the GPL asks to say what the app is built on and where its source is
export function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.25 }}
      className="pt-2 pb-8 text-center text-xs leading-relaxed text-ink-muted"
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
    </motion.footer>
  );
}
