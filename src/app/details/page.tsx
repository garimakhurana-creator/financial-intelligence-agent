import { permanentRedirect } from "next/navigation";

// The detailed comparison now lives on My Portfolio.
export default function Details() {
  permanentRedirect("/portfolio");
}
