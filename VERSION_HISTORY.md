# GOALBALL LIVE 버전 보관

## v1 — 실제 사용 피드백 반영 전

2026-10-08에 공개 저장소 커밋 `9e0eee2`와 동일한 파일을 `v1/`에 보관했습니다. `GOALBALL_LIVE-v1-backup.zip`은 같은 파일의 로컬 백업입니다.

- v1 자동 저장 키: `goalball-live-v4`, JSON schemaVersion 4
- app.js SHA256: `A4A24BA02EA9FD301CF25134CF1E9A7C9D83E21A4CF4A2991F890315326B7914`
- index.html SHA256: `7BB0C524251C07180C71D9C530C861F593590B8C0245E464C9C55E6E4BE8E9D0`
- styles.css SHA256: `48DD27187C94CA8A56F40B01AB2C134D0C7A14FA040CD374ACCD8D7F3EF3098A`

## v2 — 실제 경기 피드백 반영

선수 이름 선택 입력, 선수교체와 포지션 변경 구분, 수기 이벤트 시간, 골대 기준 1~6구역, 거리 없는 좌우 아웃 표시를 제공합니다. v2 자동 저장 키는 `goalball-live-v5`, JSON schemaVersion은 5입니다. 기존 저장을 읽어 별도 키에 저장하므로 v1 원본은 삭제하지 않습니다. v2에서 만든 새 기록은 v1에 자동 반영되지 않습니다.

v1 프로그램은 `/GOALBALL_LIVE/v1.html`에서 다시 실행할 수 있습니다. v1.html은 원본 CSS와 JavaScript를 그대로 포함한 단일 HTML 실행 파일이며 원본 파일은 v1/와 백업 ZIP에 보관합니다. v2 파일은 이전 프로그램이 지원하지 않는 필드를 포함하므로 v1로 가져오지 마세요.

## v3 — 코트 좌표·여러 경기 통합 분석

v2 공개 커밋 `67b72961db248c0865d4d48a6ada04c6e061504e`의 실행 파일을 `v2/`에 그대로 보존합니다. v3는 루트 주소에서 실행됩니다. v2는 `/GOALBALL_LIVE/v2/`에서 실행할 수 있습니다.

schemaVersion 6, 독립 자동 저장 키 goalball-live-v6. 아웃 좌표, 지점별 수정, 경기명을 포함하는 파일명, 여러 경기 통합 필터 및 팀·선수별 히트맵, 상단 이벤트 타임라인과 L/C/R 시퀀스, 선수 득점률과 주요 코스 패턴 상위 3개를 제공합니다. v2 JSON은 읽을 수 있으며 원래 저장은 유지합니다.
