"""웹 지도(index.html)의 길찾기 알고리즘을 파이썬으로 옮긴 모듈.
규칙(가중치, 입구 30m 연결, 중정 입구 제외 등)은 index.html의 CONFIG.nav와 같다.
"""
import json, csv, math, re
from pathlib import Path
LNG0, LAT0 = 127.0185, 37.6513
KX = 111320*math.cos(math.radians(LAT0)); KY = 110540
toXY = lambda p: (( p[0]-LNG0)*KX, (p[1]-LAT0)*KY)
dist = lambda a,b: math.hypot(a[0]-b[0], a[1]-b[1])
def proj(p,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]; L2=dx*dx+dy*dy
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2)) if L2 else 0
    q=(a[0]+t*dx,a[1]+t*dy); return dict(t=t,q=q,d=dist(p,q))
NAV=dict(snapM=1,entranceMaxM=30,bypassSlackM=10,courtyardM=3)
HERE=Path(__file__).resolve().parent
SHEET=HERE/'sheet_2026-11-06'          # 분석에 쓴 시트 사본(2026-11-06 내려받음)
DATA=HERE.parent/'data'                 # 웹 지도와 같은 GeoJSON
routes_csv={r['route_id']:r for r in csv.DictReader(open(SHEET/'routes.csv',encoding='utf-8'))}
fac=list(csv.DictReader(open(SHEET/'facilities.csv',encoding='utf-8')))
bld=list(csv.DictReader(open(SHEET/'buildings.csv',encoding='utf-8')))
rgeo=json.load(open(DATA/'routes.geojson',encoding='utf-8')); bgeo=json.load(open(DATA/'buildings.geojson',encoding='utf-8'))
LEVELS=['원활','일부 제약','어려움','정보 없음']

class Net:
    def __init__(self, route_cond):
        lines=[]
        for f in rgeo['features']:
            g=f['geometry']; parts=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
            for c in parts:
                if len(c)>1: lines.append(dict(id=f['properties']['route_id'],cond=route_cond[f['properties']['route_id']],pts=[toXY(p) for p in c]))
        for A in lines:
            for end in [A['pts'][0],A['pts'][-1]]:
                for B in lines:
                    if B is A: continue
                    for i in range(len(B['pts'])-1):
                        r=proj(end,B['pts'][i],B['pts'][i+1])
                        if r['d']<=NAV['snapM'] and dist(r['q'],B['pts'][i])>NAV['snapM'] and dist(r['q'],B['pts'][i+1])>NAV['snapM']:
                            B['pts'].insert(i+1,r['q']); break
        self.nodes=[]; self.edges=[]
        def nodeOf(p):
            for i,n in enumerate(self.nodes):
                if dist(n,p)<=NAV['snapM']: return i
            self.nodes.append(p); return len(self.nodes)-1
        for L in lines:
            for i in range(len(L['pts'])-1):
                a,b=nodeOf(L['pts'][i]),nodeOf(L['pts'][i+1])
                if a!=b: self.edges.append(dict(a=a,b=b,len=dist(self.nodes[a],self.nodes[b]),id=L['id'],cond=L['cond']))
        self.adj=[[] for _ in self.nodes]
        for i,e in enumerate(self.edges): self.adj[e['a']].append(i); self.adj[e['b']].append(i)
    def w(self,e,prof): return prof.get(e['cond'],math.inf)
    def attach(self,p,prof):
        nearestAny=math.inf; best=None
        for i,e in enumerate(self.edges):
            r=proj(p,self.nodes[e['a']],self.nodes[e['b']])
            nearestAny=min(nearestAny,r['d'])
            if not math.isfinite(self.w(e,prof)): continue
            if best is None or r['d']<best['d']: best=dict(r,ei=i)
        if best is None or best['d']>NAV['entranceMaxM'] or best['d']>nearestAny+NAV['bypassSlackM']: return None
        return best
    def shortest(self,S,T,prof):
        n=len(self.nodes); cost=[math.inf]*n; prev=[-1]*n; prevE=[-1]*n; done=[False]*n
        es,et=self.edges[S['ei']],self.edges[T['ei']]
        for v in (es['a'],es['b']): cost[v]=dist(S['q'],self.nodes[v])*self.w(es,prof); prevE[v]=S['ei']
        while True:
            u=-1
            for i in range(n):
                if not done[i] and cost[i]<math.inf and (u<0 or cost[i]<cost[u]): u=i
            if u<0: break
            done[u]=True
            for ei in self.adj[u]:
                e=self.edges[ei]; w=self.w(e,prof)
                if not math.isfinite(w): continue
                v=e['b'] if e['a']==u else e['a']; c=cost[u]+e['len']*w
                if c<cost[v]: cost[v]=c; prev[v]=u; prevE[v]=ei
        end=-1; best=math.inf
        for v in (et['a'],et['b']):
            c=cost[v]+dist(self.nodes[v],T['q'])*self.w(et,prof)
            if c<best: best=c; end=v
        if S['ei']==T['ei']:
            c=dist(S['q'],T['q'])*self.w(es,prof)
            if c<=best: return dict(cost=c,pts=[S['q'],T['q']],eids=[S['ei']])
        if end<0 or best==math.inf: return None
        pts=[T['q']]; eids=[T['ei']]; v=end
        while True:
            pts.append(self.nodes[v]); eids.append(prevE[v])
            if prev[v]==-1: break
            v=prev[v]
        pts.append(S['q']); pts.reverse(); eids.reverse()
        return dict(cost=best,pts=pts,eids=eids)

# courtyard exclusion
def inRing(p,ring):
    inside=False; j=len(ring)-1
    for i in range(len(ring)):
        xi,yi=ring[i]; xj,yj=ring[j]
        if (yi>p[1])!=(yj>p[1]) and p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi: inside=not inside
        j=i
    return inside
holes=[]
for g in bgeo['features']:
    for ring in g['geometry']['coordinates'][1:]: holes.append([toXY(p) for p in ring])
def nearRing(p,ring,m): return any(proj(p,ring[i-1],ring[i])['d']<=m for i in range(1,len(ring)))
excluded=set()
for f in fac:
    if f['type']=='입구' and f['lng'] and f['lat']:
        p=toXY((float(f['lng']),float(f['lat'])))
        if any(inRing(p,r) or nearRing(p,r,NAV['courtyardM']) for r in holes): excluded.add(f['facility_id'])

def entranceLevel(f, override):
    lv=override.get(f['facility_id'], f['access_level'])
    if lv in LEVELS and lv!='정보 없음': return lv
    t=' '.join([f['equipment'],f['location_desc'],f['note']]); t=re.sub(r'경사로\s*(없음|미설치|x)','',t,flags=re.I)
    if re.search('계단',t) and not re.search(r'경사로|평지|턱\s*없|무단차|엘리베이터|리프트',t): return '어려움'
    return '정보 없음'
def entrances(bid, override):
    return [dict(f=f,lv=entranceLevel(f,override),xy=toXY((float(f['lng']),float(f['lat']))))
            for f in fac if f['building_id']==bid and f['type']=='입구' and f['lng'] and f['lat'] and f['facility_id'] not in excluded]

def plan(net, a, b, prof, entCost, override, allowHard=False):
    def pick(bid):
        al=entrances(bid,override)
        if not al: return None,'입구 미등록'
        ok=al if allowHard else [e for e in al if e['lv']!='어려움']
        if not ok: return None,'모든 입구 어려움'
        near=[dict(e,at=net.attach(e['xy'],prof)) for e in ok]; near=[e for e in near if e['at']]
        if not near: return None,'입구 근처 이용 가능한 길 없음'
        return near,None
    A,ra=pick(a)
    if not A: return None,ra
    B,rb=pick(b)
    if not B: return None,rb
    best=None
    for s in A:
        for t in B:
            p=net.shortest(s['at'],t['at'],prof)
            if not p: continue
            tot=p['cost']+(s['at']['d']+t['at']['d'])*1.5+entCost.get(s['lv'],30)+entCost.get(t['lv'],30)
            if best is None or tot<best['total']: best=dict(p,total=tot,s=s,t=t)
    if not best: return None,'이어진 길 없음'
    return best,None
def geomlen(net,r):
    L=sum(dist(r['pts'][i],r['pts'][i+1]) for i in range(len(r['pts'])-1))
    return L+dist(r['s']['xy'],r['s']['at']['q'])+dist(r['t']['xy'],r['t']['at']['q'])
