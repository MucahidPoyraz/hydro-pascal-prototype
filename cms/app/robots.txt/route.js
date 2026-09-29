import {readContent} from '../lib/content.js';
import {renderRobots} from '../lib/seo.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  let settings={};
  try{settings=readContent().settings||{};}catch{}
  return new Response(renderRobots(settings),{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}
