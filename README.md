# SOP Score Tracker

SOP 1차 감수 후 학생 초안의 구조 점수, 대규모 수정, 문제 유형과 작업 시간을 기록하는 개인용 데스크톱 웹앱입니다.

## 사용

- 배포 주소: https://mworkroom.github.io/draft-pattern-log/
- 화면 왼쪽에서 평가를 입력하고 **Save Review**를 누릅니다. 오른쪽 Dashboard는 즉시 갱신됩니다.
- 학생 이름을 누르면 기존 기록을 수정할 수 있고, 행 끝의 휴지통 버튼으로 삭제할 수 있습니다.
- **Filters**로 감수일, 언어, Level, Field, School Tier, Problem Type을 조합합니다. 분석 탭에서 언어 비교, 항목별 점수, 문제 유형을 확인합니다.
- 헤더의 **Backup**은 전체 기록을 JSON으로 내려받습니다. 옆의 업로드 아이콘은 JSON 복원, 다운로드 아이콘은 CSV 내보내기입니다.

학생 기록은 서버나 GitHub 저장소에 올라가지 않고, 이 웹주소를 연 브라우저 프로필의 localStorage에 저장됩니다. 같은 mworkroom.github.io 도메인의 다른 페이지와 브라우저 저장공간을 공유합니다. 다른 브라우저·프로필·PC로 자동 동기화되지 않으며 브라우저의 사이트 데이터를 지우면 사라질 수 있습니다. 정기적으로 JSON 백업 파일이 실제로 다운로드되었는지 확인하고 별도 위치에 보관해 주세요. 백업·CSV 파일에는 학생 이름과 메모가 포함됩니다.

## 개발

Node.js 24에서 npm ci로 의존성을 설치하고, npm run dev로 실행합니다. npm test와 npm run build로 검증합니다.

로컬 개발 주소는 http://127.0.0.1:5173/draft-pattern-log/ 입니다. main에 푸시하면 GitHub Actions가 검사와 빌드를 마친 뒤 GitHub Pages에 배포합니다. 앱은 정적 파일만 배포합니다.
