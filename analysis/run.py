"""보고서 Ⅴ장 접근성 경로 분석 실행 파일.
사용법: analysis 폴더에서  python run.py
결과: 화면에 요약 숫자 출력 + route_analysis_results.csv 저장
"""
from nav import *
import csv as _csv
import itertools, statistics as st, json
WC={'원활':1,'일부 제약':2,'정보 없음':3}
AS={'원활':1,'일부 제약':1.3,'정보 없음':1.5,'어려움':2}
BASE={k:1 for k in LEVELS}
EC={'원활':0,'일부 제약':30,'정보 없음':30}
cur_routes={k:v['condition'] for k,v in routes_csv.items()}
r2023=dict(cur_routes)   # 길 상태는 2023 맵 길 표시와 대조 전이므로 현재와 같게 둠
o2023={'E08':'일부 제약','E11':'어려움','E12':'어려움','E06':'일부 제약','E01':'일부 제약'}
# 2023 맵: 학생회관 '도서관 방면 입구 평평하여 진입 가능'(E08, 자동문 설치 전) / '정문·후문 계단'(E16, 현재도 어려움) / E37(차미리사관–학생회관 사잇길)은 2023 맵에 안내가 없어 현재 값 유지
#          도서관 '경사로 있으나 막혀 있어 실사용 불편'(E11·E12) / 대강의동 '입구 양옆 경사로'(현재와 같음)
o2023c=o2023   # (이전 버전의 보수적 시나리오는 2023 맵 원본 확인 후 본 시나리오와 같아져 통합)
net_cur=Net(cur_routes); net23=Net(r2023)
print('nodes',len(net_cur.nodes),'edges',len(net_cur.edges),'excluded',sorted(excluded))
ids=[b['building_id'] for b in bld]; name={b['building_id']:b['name'] for b in bld}
pairs=list(itertools.combinations(ids,2))
def lvl(lv): return lv
rows=[]
for a,b in pairs:
    base,rb=plan(net_cur,a,b,BASE,{},{},allowHard=True)
    wc,rw=plan(net_cur,a,b,WC,EC,{})
    asr,ra=plan(net_cur,a,b,AS,EC,{})
    w23,r23=plan(net23,a,b,WC,EC,o2023)
    w23c,_=plan(net23,a,b,WC,EC,o2023c)
    row=dict(a=a,b=b)
    if base:
        conds=[net_cur.edges[e]['cond'] for e in base['eids']]
        ents=[base['s']['lv'],base['t']['lv']]
        row['base_len']=geomlen(net_cur,base)
        row['base_hard']= ('어려움' in conds) or ('어려움' in ents)
        row['base_hard_route']='어려움' in conds; row['base_hard_ent']='어려움' in ents
        row['base_ents']=(base['s']['f']['facility_id'],base['t']['f']['facility_id'])
    else: row['base_fail']=rb
    if wc: row['wc_len']=geomlen(net_cur,wc); row['wc_ents']=(wc['s']['f']['facility_id'],wc['t']['f']['facility_id']); row['wc_warn']=any(net_cur.edges[e]['cond']!='원활' for e in wc['eids'])
    else: row['wc_fail']=rw
    if asr: row['as_len']=geomlen(net_cur,asr); row['as_hard']=any(net_cur.edges[e]['cond']=='어려움' for e in asr['eids'])
    else: row['as_fail']=ra
    if w23: row['w23_len']=geomlen(net23,w23)
    else: row['w23_fail']=r23
    row['w23c_ok']=bool(w23c)
    rows.append(row)
# 결과표: 사람이 읽기 쉬운 값으로 저장 (엑셀·한셀에서 바로 열리도록 UTF-8 BOM)
def _m(r,k): return round(r[k]) if k in r else '-'
def _hard(r):
    if 'base_len' not in r: return '-'
    parts=[x for x,f in (('입구','base_hard_ent'),('구간','base_hard_route')) if r.get(f)]
    return '·'.join(parts) if parts else '없음'
RESULT_HEADER=['출발 건물','도착 건물','일반 최단 경로(m)','일반 최단 경로의 어려움 요소',
               '휠체어 단독 경로(m)','우회율(배)','휠체어 단독 불가 사유',
               '2023년 정보 기준 휠체어 단독 경로(m)','2023년 정보 기준 불가 사유']
result_rows=[]
for r in rows:
    if 'arts' in (r['a'],r['b']): continue   # 예술관: 입구가 길에서 30m 넘게 떨어져 분석 제외
    result_rows.append([name[r['a']],name[r['b']],_m(r,'base_len'),_hard(r),_m(r,'wc_len'),
        round(r['wc_len']/r['base_len'],2) if 'wc_len' in r else '-', r.get('wc_fail','-'),
        _m(r,'w23_len'), r.get('w23_fail','-')])
with open(HERE/'route_analysis_results.csv','w',encoding='utf-8-sig',newline='') as f:
    w=_csv.writer(f); w.writerow(RESULT_HEADER); w.writerows(result_rows)
N=len(rows)
bok=[r for r in rows if 'base_len' in r]
print('pairs',N,'base found',len(bok))
print('base fail reasons',[ (name[r['a']],name[r['b']],r['base_fail']) for r in rows if 'base_fail' in r])
hard=[r for r in bok if r['base_hard']]
print('base uses 어려움',len(hard),'route',sum(r['base_hard_route'] for r in bok),'ent',sum(r['base_hard_ent'] for r in bok))
wok=[r for r in rows if 'wc_len' in r]
print('wc reachable',len(wok))
from collections import Counter
print('wc fail',Counter(r['wc_fail'] for r in rows if 'wc_fail' in r))
print('wc fail pairs',[(name[r['a']],name[r['b']],r['wc_fail']) for r in rows if 'wc_fail' in r])
both=[r for r in rows if 'wc_len' in r and 'base_len' in r]
ratios=[r['wc_len']/r['base_len'] for r in both]
print('detour mean',st.mean(ratios),'median',st.median(ratios),'max',max(ratios),'n>1.05',sum(x>1.05 for x in ratios))
hb=[r for r in both if r['base_hard']]
if hb:
    rr=[r['wc_len']/r['base_len'] for r in hb]; print('detour among hard base: n',len(hb),'mean',st.mean(rr),'max',max(rr))
print('hard base & wc unreachable',sum(1 for r in hard if 'wc_fail' in r))
print('base len mean',st.mean(r['base_len'] for r in bok),'wc mean',st.mean(r['wc_len'] for r in wok))
print('assisted reachable',sum('as_len' in r for r in rows),'assisted uses hard',sum(r.get('as_hard',False) for r in rows))
print('wc warn (non-원활 segment)',sum(r.get('wc_warn',False) for r in wok))
# 2023
w23ok=[r for r in rows if 'w23_len' in r]
print('2023 info reachable',len(w23ok),'conservative',sum(r['w23c_ok'] for r in rows))
gain=[r for r in rows if 'wc_len' in r and 'w23_len' not in r]
print('newly reachable',len(gain)); print(Counter(x for r in gain for x in (name[r['a']],name[r['b']])))
lost=[r for r in rows if 'wc_len' not in r and 'w23_len' in r]; print('lost',len(lost))
sh=[r for r in rows if 'wc_len' in r and 'w23_len' in r]
d=[r['w23_len']-r['wc_len'] for r in sh]; print('both reachable',len(sh),'shorter now',sum(x>1 for x in d),'mean saving among shorter',st.mean([x for x in d if x>1]) if any(x>1 for x in d) else 0, 'longer now',sum(x<-1 for x in d))
print('2023 fail',Counter(r['w23_fail'] for r in rows if 'w23_fail' in r))
