import type { Metadata } from "next";
import { SrtMakerClient } from "@/components/SrtMakerClient";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    absolute: "Deranged Fan SRT Maker",
  },
  description: "Generate one-word SRT lyric captions from an acapella MP3 and TXT transcript.",
  keywords: [],
  alternates: {
    canonical: "/srt-maker",
  },
  openGraph: {
    title: "Deranged Fan SRT Maker",
    description:
      "Generate one-word SRT lyric captions from an acapella MP3 and TXT transcript.",
    url: "/srt-maker",
    siteName: "Deranged Fan",
  },
  twitter: {
    card: "summary",
    title: "Deranged Fan SRT Maker",
    description:
      "Generate one-word SRT lyric captions from an acapella MP3 and TXT transcript.",
    creator: "",
  },
};

export default function SrtMakerPage() {
  return <SrtMakerClient />;
}
