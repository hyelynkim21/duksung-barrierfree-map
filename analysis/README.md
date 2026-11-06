# 접근성 경로 분석 (보고서 Ⅴ장)

웹 지도의 길찾기를 건물 쌍마다 자동으로 실행해, 보고서 Ⅴ장의 숫자를 계산한 코드입니다.
웹 서비스 동작에는 필요하지 않습니다.

## 파일
- `nav.py` : 웹 지도(index.html)의 길찾기 알고리즘을 파이썬으로 옮긴 것 (규칙은 CONFIG.nav와 같음)
- `run.py` : 105개 건물 쌍에 대해 일반 최단 / 휠체어 단독 / 도움 이동 경로와 2023년 정보 기준 경로를 계산
- `sheet_2026-11-06/` : 분석에 사용한 구글 시트 사본 (buildings, facilities, routes)
- `route_analysis_results.csv` : 건물 쌍별 결과 (예술관 제외 91쌍). `run.py`를 실행하면 새로 만들어짐
- `route_analysis_results.xlsx` : 위 결과를 보기 좋게 정리한 엑셀 파일 (요약 시트 + 결과 시트, '어려움' 포함 쌍은 분홍색 표시)

## 실행
```
cd analysis
python run.py
```
Python 3 표준 라이브러리만 사용합니다. 길 모양은 `../data/routes.geojson`, `../data/buildings.geojson`을 읽습니다.

## 2023년 정보 가정 (보고서 [표-05])
`run.py`의 `o2023`(입구), `r2023`(길)에 적혀 있습니다. 근거가 된 2023 배리어프리맵 문구는 run.py 주석에 적혀 있습니다.
