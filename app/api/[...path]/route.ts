const backendOrigin = () => process.env.BACKEND_URL ?? "http://127.0.0.1:4000";
async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("origin") !== incoming.origin) return Response.json({error:"Cross-origin request denied"},{status:403});
  if (path.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return new Response(null,{status:400});
  const target = new URL('/api/'+path.join('/')+incoming.search,backendOrigin());
  const headers = new Headers({"x-laundry-portal":"office",origin:target.origin});
  const cookie = request.headers.get("cookie")?.split(';').map(part=>part.trim()).find(part=>part.startsWith('laundry_office_session='));
  if (cookie) headers.set('cookie',cookie);
  if (request.headers.has('content-type')) headers.set('content-type',request.headers.get('content-type')!);
  const body = ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  if (body && body.byteLength > 2_000_000) return Response.json({error:'Request too large'},{status:413});
  try {
    const response=await fetch(target,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(30_000)});
    const resultHeaders=new Headers({'content-type':response.headers.get('content-type') ?? 'application/json','cache-control':'no-store'});
    const setCookie=response.headers.get('set-cookie');
    if(setCookie) resultHeaders.set('set-cookie',setCookie+(incoming.protocol==='https:' && !/;\s*Secure/i.test(setCookie)?'; Secure':''));
    return new Response(response.body,{status:response.status,headers:resultHeaders});
  } catch {return Response.json({error:'The backend is unavailable. Please try again.'},{status:502});}
}
export const GET=forward, POST=forward, PATCH=forward, PUT=forward, DELETE=forward;
