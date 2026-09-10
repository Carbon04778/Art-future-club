/**
 * Notifications.
 *
 * The bell derives notifications from the underlying data rather than storing
 * them, so a notification cannot be lost by a failed write. This drives the
 * real hook against the demo provider and asserts that each kind reaches the
 * person it should — and only that person.
 *
 * It also covers read state, which used to be a single timestamp in
 * localStorage: opening the page marked everything read whether or not it had
 * been looked at, and nothing stayed read on another device.
 *
 * Run: npm run verify:notifications
 */
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url:"http://localhost/", pretendToBeVisual:true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis,"navigator",{value:window.navigator,configurable:true});
for (const k of ["HTMLElement","Element","Node","File","Blob","Event","MouseEvent","SVGElement","DOMRect"]) globalThis[k]=window[k];
window.URL.createObjectURL=()=> "blob:x"; window.URL.revokeObjectURL=()=>{};
globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(Date.now()),0);
globalThis.ResizeObserver=window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
globalThis.IntersectionObserver=window.IntersectionObserver=class{
  constructor(cb){this.cb=cb;} observe(el){this.cb([{target:el,isIntersecting:true,intersectionRatio:1}],this);}
  unobserve(){}disconnect(){}takeRecords(){return[];}};
window.scrollTo=()=>{};

const React=(await import("react")).default;
const { createRoot }=await import("react-dom/client");
const { entities, auth }=await import("../src/api/providers/mock.js");
const useNotifications=(await import("../src/hooks/useNotifications.js")).default;

let pass=0; const failures=[];
const check=(n,c,d="")=>(c?pass++:failures.push(`${n}${d?` — ${d}`:""}`));
const settle=ms=>new Promise(r=>setTimeout(r,ms));
const now=()=>new Date().toISOString();

/* ------------------------------------------------------------ fixtures */
await auth.loginViaEmailPassword("admin@artfutureclub.com","password123");
const ME="user_ada";
const OTHER="user_ben";

const myProfile=await entities.ArtistProfile.create({
  display_name:"Ada Maker", discipline:"Painting", user_id:ME, status:"approved",
  avatar_url:"/images/placeholder.webp", bio:"b", based_in:"London",
  portfolio_works:[{title:"Piece One", image_url:"/images/placeholder.webp"}],
});
// Someone I follow, who then adds a work.
const followed=await entities.ArtistProfile.create({
  display_name:"Bea Followed", discipline:"Sculpture", user_id:OTHER, status:"approved",
  avatar_url:"/images/placeholder.webp", bio:"b", based_in:"London",
  portfolio_works:[{title:"Fresh Piece", image_url:"/images/placeholder.webp", added_date:now()}],
});
// A profile of mine that an admin has just reviewed.
const reviewed=await entities.ArtistProfile.create({
  display_name:"Ada Second", discipline:"Drawing", user_id:ME, status:"approved",
  avatar_url:"/images/placeholder.webp", bio:"b", based_in:"London",
  reviewed_at: now(), review_note:null,
});
// Waiting for review — admins should see this.
await entities.ArtistProfile.create({
  display_name:"Cid Pending", discipline:"Painting", user_id:"user_cid", status:"pending",
  avatar_url:"/images/placeholder.webp", bio:"b", based_in:"London",
});

await entities.Message.create({ sender_id:OTHER, sender_name:"Ben", recipient_id:ME,
  recipient_name:"Ada", body:"Is this piece still available?", read:false });
const post=await entities.ForumPost.create({ author_id:ME, author_name:"Ada",
  title:"Shipping framed prints?", body:"b", category:"Advice", reply_count:0 });
await entities.ForumReply.create({ post_id:post.id, author_id:OTHER, author_name:"Ben", body:"Use acrylic." });
await entities.Comment.create({ user_id:OTHER, user_name:"Ben", target_id:myProfile.id,
  target_type:"artist_profile", body:"Wonderful surface." });
await entities.Inquiry.create({ artist_id:myProfile.id, artist_user_id:ME, artist_name:"Ada Maker",
  work_title:"Piece One", price:"3,000", currency:"GBP", buyer_name:"Iris",
  buyer_email:"iris@example.com", message:"Interested.", status:"new", type:"purchase" });
await entities.CollectedWork.create({ user_id:OTHER, artist_id:myProfile.id, artist_name:"Ada Maker",
  work_ref:`${myProfile.id}-work-0`, work_title:"Piece One" });
await entities.Follow.create({ follower_id:OTHER, following_id:ME, following_name:"Ada Maker" });
await entities.Follow.create({ follower_id:ME, following_id:OTHER, following_name:"Bea Followed" });

/* ------------------------------------------------- drive the real hook */
let latest=null;
function Probe({ isAdmin }){
  const n = useNotifications(ME, { isAdmin });
  latest = n;
  return null;
}
async function run(isAdmin=false){
  document.body.innerHTML="<div id='root'></div>";
  const root=createRoot(document.getElementById("root"));
  let cap=null; const orig=console.error;
  console.error=(...a)=>{if(!cap)cap=a.map(x=>x?.message||String(x)).join(" ").slice(0,300);};
  root.render(React.createElement(Probe,{isAdmin}));
  await settle(1500); console.error=orig;
  return cap;
}

const cap=await run(false);
check("the hook runs without crashing", !cap, cap||"");
const kinds=()=>new Set((latest?.items||[]).map(i=>i.kind));
const find=(kind)=>(latest?.items||[]).find(i=>i.kind===kind);

for (const [kind,label] of [
  ["message","a message"],
  ["reply","a reply to my post"],
  ["comment","a comment on my work"],
  ["inquiry","an ENQUIRY on my work"],
  ["collected","someone collecting my work"],
  ["follow","a new follower"],
  ["review","my profile being approved"],
  ["new_work","a new work by an artist I follow"],
]) {
  check(`notifies me about ${label}`, kinds().has(kind), [...kinds()].join(", "));
}

check("does NOT show the admin review queue to a normal member",
  !kinds().has("review_queue"), [...kinds()].join(", "));

/* ----------------------------------------------- every one is clickable */
const bad=(latest?.items||[]).filter(i=>!i.link||!i.key);
check("every notification has a link and a stable key", bad.length===0,
  bad.map(b=>b.kind).join(", "));

/* --------------------------------------------------------- admin view */
await run(true);
check("an admin IS told a profile is waiting for review", kinds().has("review_queue"));
const q=find("review_queue");
check("the review-queue item points at the admin dashboard", q?.link==="/admin", q?.link);

/* ------------------------------------------- read state, per item, synced */
await run(false);
const before=latest.unreadCount;
check("there are unread notifications to begin with", before>0, String(before));
const target=find("follow");
check("picked one to read", !!target);
await latest.markRead(target.key);
await settle(400);
check("marking one read drops the unread count by exactly one",
  latest.unreadCount===before-1, `${before} -> ${latest.unreadCount}`);
check("that one is now read", find("follow")?.unread===false);

// A fresh mount must still see it as read — this is the "stays read" part.
await run(false);
check("it is STILL read after a reload (stored, not in-memory)",
  find("follow")?.unread===false, String(find("follow")?.unread));
check("the others are still unread", latest.unreadCount===before-1,
  `${latest.unreadCount} vs ${before-1}`);

/* -------------------------------------------------------- mark all read */
await latest.markAllRead();
await settle(600);
check("mark-all clears the count", latest.unreadCount===0, String(latest.unreadCount));
await run(false);
check("and it stays cleared after a reload", latest.unreadCount===0, String(latest.unreadCount));

console.log("");
if(failures.length){console.log(`  passed: ${pass}`);console.log(`  FAILED: ${failures.length}\n`);
  for(const f of failures) console.log(`   x ${f}`); process.exit(1);}
console.log(`  passed: ${pass}`);
console.log("  every notification type reaches the right person, and read state sticks\n");

/*
 * Explicit exit. useNotifications keeps a 90-second polling interval running
 * and the probe component is never unmounted, so Node would otherwise sit here
 * with an idle timer instead of finishing — which hangs verify:all.
 */
process.exit(0);
