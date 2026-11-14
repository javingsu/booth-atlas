# BOOTH ATLAS

전시 부스 디자인·시공 레퍼런스 라이브러리입니다. ChatGPT Sites 버전(booth-atlas-studio)에서 GitHub Pages로 옮겼습니다.

- 사이트: https://javingsu.github.io/booth-atlas/ (검색엔진 노출 차단 `noindex`)
- 자료: `data/library.json` — 원본 사이트의 레퍼런스 259건(대표 255건)과 분류·출처·수집 이력을 그대로 옮겼습니다.

## 자동 업데이트

`.github/workflows/update.yml`

| 언제 | 하는 일 |
|:--|:--|
| 매주 월요일 09:07 (한국 시간) | 공개 출처에서 새 레퍼런스 수집 → 분류·중복 정리 → 저장 → 배포 |
| Actions 탭 › Run workflow | 위 수집을 지금 바로 실행 |
| 소유자가 이슈 등록 | 사이트의 ‘GitHub에 반영’ 변경 / ‘레퍼런스 추가’ 이슈 폼을 반영하고 이슈를 닫음 |
| `index.html`·`lib/`·`data/` 수정 push | 사이트만 다시 배포 |

수집 출처(`collector/config.json`): 네이버 블로그 공개 RSS 5곳(bmsplan, groupmco88, epicdesigngroup_01, lf-exhibition, dimca), 부스 시공 블로그(Tistory RSS), EX Booth, 전시기획틈, Blue Point, FM BUILD 공개 페이지.
Pinterest·Behance·빌드만 등 로그인·차단이 있는 곳은 우회하지 않고 직접 추가한 링크만 보관합니다.

- **분류**: 제목 키워드(목공/블럭/옥타·패브릭/트러스/컨퍼런스, 일본어 포함). 한 종류만 뚜렷하면 ‘자동 분류’, 애매하면 ‘분류 확인 필요’. 직접 정리한 자료(`manual`)는 수집기가 바꾸지 않습니다.
- **중복**: 원문 주소 · 이미지 주소 · 이미지 SHA-256 · 256비트 dHash(차이 2비트 이하, 평균색 차이 5 이하).
- **이미지 없는 자료**: 원문 페이지의 대표 이미지(og:image)를 30일 간격으로 다시 찾아봅니다.

## 사이트에서 편집하기

즐겨찾기·분류·메모·태그·삭제·레퍼런스 추가는 먼저 그 브라우저에 저장되고(상단 노란 막대), **GitHub에 반영**을 누르면 변경 내용이 담긴 이슈가 열립니다. 등록하면 워크플로가 `data/library.json`에 적용하고 1~2분 뒤 모든 기기에 보입니다. 이슈는 저장소 소유자가 연 것만 처리합니다.

## 개발

```bash
node test/run_test.mjs   # 가짜 fetch 통합 테스트 (네트워크 불필요)
```

- `lib/library.mjs` — 사이트와 수집기가 함께 쓰는 순수 함수(분류, 중복, 변경 적용)
- `collector/parsers.mjs` — RSS·HTML 파서, `collector/collect.mjs` — 주간 수집, `collector/apply-issue.mjs` — 이슈 반영

이미지의 저작권은 각 원저작자에게 있습니다. 이미지는 저장소에 복사하지 않고 원래 주소에서 불러오며, 게시 중단 요청은 이슈로 받습니다.
