import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#05070a",
    display: "standalone",
    icons: [
      {
        sizes: "any",
        src: "/favicon.ico",
        type: "image/x-icon",
      },
    ],
    name: "WZRD.tech — Creator OS",
    short_name: "WZRD.tech",
    start_url: "/",
    theme_color: "#05070a",
  };
}
