import { permanentRedirect } from 'next/navigation';
// Permanent (308): search engines should index /tr/index.html, not the bare domain redirect.
export default function Home(){ permanentRedirect('/tr/index.html'); }
