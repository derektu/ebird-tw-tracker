import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeBirdSpotDirectory, searchBirdSpots } from "../src/domain/bird-spot-directory.mjs";
import { createBirdSpotDirectoryService, directoryTtlMs } from "../server/services/bird-spot-directory-service.mjs";
import { createFileBirdSpotDirectoryCache } from "../server/storage/bird-spot-directory-cache.mjs";
import { createApplication } from "../server/application.mjs";
import workerDefault, { createSearchWorker } from "../worker/index.mjs";
import { directoryCacheUrl, directoryRetentionSeconds } from "../worker/bird-spot-directory.mjs";

const raw = [{ locId: "L1", locName: "臺北 Old Park", countryCode: "TW", subnational1Code: "TW-TPE", lat: 25, lng: 121, latestObsDt: "1999-01-01", note: "unexpected upstream private field" }, { locId: "L2", locName: "臺北 Old Park" }, {locId: "L3", lat: 200}];
const saved = [{ locId: "L1", locName: "舊名稱", alias: "私房", note: "獨有筆記", pinned: true }, {locId: "L4", locName: "個人地點", note: "私人收藏"}];
const get = key => new Request("https://test/api/bird-spots/directory", {headers: key ? {"X-eBird-Api-Key":key} : {}});
function edgeCache(clock) {
  let entry;
  return {
    async match(request) { assert.equal(request.url, directoryCacheUrl); assert.equal([...request.headers].length, 0); return entry && clock() < entry.expires ? entry.response.clone() : undefined; },
    async put(request, response) {
      assert.equal(request.url, directoryCacheUrl);
      const payload = await response.clone().text();
      assert.ok(!payload.includes("secret-key") && !payload.includes("獨有筆記") && !payload.includes("unexpected upstream"));
      assert.equal(response.headers.get("cache-control"), `public, max-age=${directoryRetentionSeconds}`);
      entry = { response: response.clone(), expires: clock() + directoryRetentionSeconds * 1000 };
    },
  };
}

test("directory normalization and local search preserve identities, optional metadata and both public/saved names", () => {
  const spots = normalizeBirdSpotDirectory([...raw,raw[0]]);
  assert.equal(spots.length, 3);
  assert.equal(spots[2].locName, null);
  assert.equal(spots[2].lat, null);
  assert.equal(spots[2].subnational2Code, null);
  assert.equal(spots[0].locationType, "hotspot");
  assert.deepEqual(searchBirdSpots(spots,saved,"台北 old").map(s=>s.locId),["L1","L2"]);
  for (const query of ["獨有筆記","私房","舊名稱","tw-tpe"]) assert.deepEqual(searchBirdSpots(spots,saved,query).map(s=>s.locId),["L1"]);
  assert.deepEqual(searchBirdSpots([],saved,"私人").map(s=>s.locId),["L4"]);
  assert.equal(searchBirdSpots(spots,saved,"").length,4);
  for (const malformed of [{},[null],[{locId:"invalid"}],[{locId:"L1",countryCode:"US"}]]) assert.throws(()=>normalizeBirdSpotDirectory(malformed));
});

test("24h lazy TTL coalesces requests, preserves stale timestamp, recovers, survives cache write failure", async () => {
  let time=1_000_000, calls=0, release, failure=false;
  const service=createBirdSpotDirectoryService({now:()=>time, writeCache:async()=>{throw Error("disk");}, upstreamFetch: async request=>{
    calls++; assert.equal(request.url,"https://api.ebird.org/v2/ref/hotspot/TW?fmt=json");
    if (release !== false) await new Promise(resolve=>{release=resolve;});
    if(failure) throw Error("secret-key");
    return Response.json(raw);
  }});
  const first=service.directory("secret-key"), second=service.directory("secret-key");
  await new Promise(resolve=>setImmediate(resolve)); release(); release=false;
  const fresh=await first; await second; assert.equal(calls,1); assert.equal(fresh.status,"fresh");
  time+=directoryTtlMs-1; await service.directory("secret-key"); assert.equal(calls,1);
  time++; failure=true;
  const stale=await service.directory("secret-key"); assert.equal(calls,2); assert.equal(stale.status,"stale"); assert.equal(stale.updatedAt,fresh.updatedAt); assert.equal(stale.error.code,"directory_unavailable");
  failure=false; const recovered=await service.directory("secret-key"); assert.equal(recovered.status,"fresh"); assert.notEqual(recovered.updatedAt,fresh.updatedAt);
});

test("coalesced different-key caller retries authentication using its own key",async()=>{
  let release; const calls=[];
  const service=createBirdSpotDirectoryService({upstreamFetch:async request=>{
    const key=request.headers.get("x-ebirdapitoken"); calls.push(key);
    if(key==="bad") {await new Promise(resolve=>release=resolve); return new Response("secret",{status:401});}
    return Response.json(raw);
  }});
  const bad=service.directory("bad"); await new Promise(resolve=>setImmediate(resolve));
  const good=service.directory("good"); release();
  assert.equal((await bad).status,"unavailable"); assert.equal((await good).status,"fresh"); assert.deepEqual(calls,["bad","good"]);
});

test("Node public file cache survives service restart and corrupt cache recovers",async context=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"directory-cache-")); context.after(()=>fs.rm(root,{recursive:true,force:true}));
  const filePath=path.join(root,"cache.json"); const cache=createFileBirdSpotDirectoryCache(filePath); let calls=0;
  const options={...cache,upstreamFetch:async()=>{calls++;return Response.json(raw);}};
  await createBirdSpotDirectoryService(options).directory("secret-key");
  assert.equal((await createBirdSpotDirectoryService(options).directory()).status,"fresh"); assert.equal(calls,1);
  assert.ok(!(await fs.readFile(filePath,"utf8")).includes("secret-key"));
  await fs.writeFile(filePath,"broken"); await createBirdSpotDirectoryService(options).directory("secret-key"); assert.equal(calls,2);
});

for(const kind of ["Node","Worker"]) test(`${kind} HTTP contract, cache, allowlist and safe directory outage`,async context=>{
  let calls=0,time=Date.now(),fail=false;
  const upstreamFetch=async request=>{calls++; assert.equal(request.url,"https://api.ebird.org/v2/ref/hotspot/TW?fmt=json"); if(fail)return new Response("secret-key",{status:500});return Response.json(raw);};
  let request;
  if(kind==="Worker") {const worker=createSearchWorker({fetch:upstreamFetch,now:()=>time}); request=(pathname,method="GET")=>worker.fetch(new Request(`https://test${pathname}`,{method,headers:{"X-eBird-Api-Key":"secret-key"}}));}
  else {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"directory-http-")); context.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=await createApplication({root,port:0,isProduction:true,env:{EBIRD_API_KEY:"secret-key"},birdSpotFetch:upstreamFetch,directoryNow:()=>time,logger:{error(){}}});context.after(()=>app.close());
    await app.services.savedBirdSpots.save({locId:"L4",locName:"個人地點"});await app.services.savedBirdSpots.update("L4",{note:"私人收藏"});
    const {url}=await app.listen(); request=(pathname,method="GET")=>fetch(url+pathname,{method});
  }
  assert.equal((await request("/api/bird-spots/directory?note=private")).status,400);
  assert.equal((await request("/api/bird-spots/directory","POST")).status,405);assert.equal(calls,0);
  const fresh=await(await request("/api/bird-spots/directory")).json(); assert.equal(fresh.status,"fresh");
  await request("/api/bird-spots/directory"); assert.equal(calls,1);
  time+=directoryTtlMs;fail=true;
  const stale=await(await request("/api/bird-spots/directory")).json();assert.equal(stale.status,"stale");assert.equal(stale.updatedAt,fresh.updatedAt);
  if(kind==="Node") {const merged=await(await request("/api/bird-spots/search?q=私人")).json();assert.equal(merged.spots[0].locId,"L4");assert.equal(merged.status,"stale");}
  else assert.equal((await request("/api/bird-spots/search?q=私人")).status,404);
});

test("Worker edge retention keeps stale after freshness expires, evicts after retention and recovers",async()=>{
  let time=Date.now(),fail=false,calls=0; const cache=edgeCache(()=>time);
  const options={cache,now:()=>time,fetch:async()=>{calls++;if(fail)throw Error("secret-key");return Response.json(raw);}};
  await createSearchWorker(options).fetch(get("secret-key"));time+=directoryTtlMs;fail=true;
  const stale=await(await createSearchWorker(options).fetch(get("secret-key"))).json();assert.equal(stale.status,"stale");assert.ok(stale.updatedAt);
  time+=directoryRetentionSeconds*1000;
  const unavailable=await(await createSearchWorker(options).fetch(get("secret-key"))).json();assert.equal(unavailable.status,"unavailable");assert.equal(unavailable.updatedAt,null);
  fail=false;assert.equal((await(await createSearchWorker(options).fetch(get("secret-key"))).json()).status,"fresh");assert.equal(calls,4);
});

test("real Worker default export coalesces across fetch invocations",async context=>{
  const original=globalThis.fetch;const originalCaches=globalThis.caches;let calls=0,release;
  globalThis.caches={default:edgeCache(Date.now)};
  globalThis.fetch=async()=>{calls++;await new Promise(resolve=>release=resolve);return Response.json(raw);};
  context.after(()=>{globalThis.fetch=original;globalThis.caches=originalCaches;});
  const first=workerDefault.fetch(get("secret-key"),{}),second=workerDefault.fetch(get("secret-key"),{});
  await new Promise(resolve=>setImmediate(resolve));release();
  assert.equal((await first).status,200);assert.equal((await second).status,200);assert.equal(calls,1);
});

test("first-load malformed/auth/rate failures remain explicit, bounded and permit local favorite search",async()=>{
  for (const response of [Response.json({}), Response.json([null]),new Response("not JSON"),new Response("secret-key",{status:401}),new Response("secret-key",{status:429})]) {
    const worker=createSearchWorker({fetch:async()=>response.clone()});
    const body=await(await worker.fetch(get("secret-key"))).json();
    assert.equal(body.status,"unavailable");assert.equal(body.updatedAt,null);assert.deepEqual(body.spots,[]);assert.ok(body.error.code);assert.ok(!JSON.stringify(body).includes("secret-key"));
    assert.equal(searchBirdSpots(body.spots,saved,"獨有")[0].locId,"L1");
  }
  let calls=0;const worker=createSearchWorker({fetch:async()=>{calls++;return Response.json(raw);}});
  const body=await(await worker.fetch(get())).json();assert.equal(body.status,"unavailable");assert.equal(body.error.code,"missing_api_key");assert.equal(calls,0);
});
