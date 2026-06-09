# 분양 상담 AI CRM

OpenAI Audio 기반 녹취 STT, AI 상담 분석, Solapi 문자 발송, Callbridge 브라우저 상담석을 포함한 CRM MVP입니다.

## 실행

```bash
npm.cmd install
npm.cmd run dev
```

더블클릭 실행은 `CRM-Run.cmd`를 사용합니다.

- Web: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8787`
- 빌드 후 단일 서버 실행: `npm.cmd run build && npm.cmd run start`

## 관리자 API 설정

상단의 `API 설정` 버튼에서 OpenAI, Solapi, Callbridge 설정을 저장할 수 있습니다.

- 저장 위치는 `.env.local`입니다.
- 비밀값은 화면/API 응답에 표시되지 않습니다.
- 비밀 입력칸을 비워 저장하면 기존 값이 유지됩니다.
- Callbridge는 API Key와 수신번호만 입력하면 됩니다. Agent Key, Callbridge 기본 API URL, 실시간 전사 모델은 자동으로 채웁니다.
- 설정 저장 API는 `localhost` 또는 `127.0.0.1` 주소에서 열린 CRM 화면에서만 허용됩니다.
- 외부 터널 주소로 관리자 설정을 열지 말고, Callbridge WebSocket 연동만 터널 주소를 사용합니다.

기존 설정 스크립트도 계속 사용할 수 있습니다.

- OpenAI: `Set-OpenAI-Key.cmd`
- Solapi 문자: `Set-Solapi-Key.cmd`
- Callbridge 상담석: `Set-Callbridge-Key.cmd`

## 환경변수

실제 키는 `.env.local`에만 저장합니다. `.env.local`은 저장소에 커밋하지 않습니다.

```bash
OPENAI_API_KEY=
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_ANALYSIS_MODEL=gpt-5-mini
SOLAPI_API_KEY=
SOLAPI_API_SECRET=
SOLAPI_SENDER_NUMBER=
CALLBRIDGE_API_KEY=
CALLBRIDGE_AGENT_API_KEY=
CALLBRIDGE_BASE_URL=https://bnd.happytalk.io/api/openapi
CALLBRIDGE_DISPLAY_NUMBER=
PUBLIC_BASE_URL=
PUBLIC_WS_BASE_URL=
OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-realtime-whisper
SUPABASE_URL=https://dmqguebuvssjbiahumhp.supabase.co
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
API_SETTINGS_ENCRYPTION_KEY=
PORT=8787
```

## Callbridge 상담석 설정

1. Callbridge 관리자 페이지에서 등록 번호와 Custom Agent 연동을 준비합니다.
2. CRM 서버를 HTTPS/WSS 터널로 외부에서 접근 가능하게 노출합니다.
3. Callbridge Custom Agent 도메인에 `wss://터널주소/api/callbridge/agent`를 등록합니다.
4. CRM 상단 `API 설정`에서 `CALLBRIDGE_API_KEY`와 Callbridge 수신번호만 저장합니다.
5. CRM이 생성한 Agent WebSocket 주소를 복사합니다.
6. Callbridge 관리자 페이지에는 터널 주소 기준 `wss://터널주소/api/callbridge/agent`를 등록합니다.

현재 구현된 통화 흐름:

- 고객이 Callbridge 등록 번호로 전화
- Callbridge가 CRM의 Agent WebSocket으로 접속
- CRM 화면에 수신콜 표시
- 상담원이 브라우저에서 `받기` 클릭
- PC 헤드셋/마이크 오디오가 CRM 서버를 통해 Callbridge로 중계
- Callbridge PCM 8k 오디오가 브라우저에서 재생
- OpenAI Realtime transcription으로 실시간 전사 표시
- 통화 종료 후 전사 기반 상담 분석 로그 저장

## 주요 기능

- 녹취 파일 업로드 또는 수동 전사 텍스트 기반 상담 분석
- OpenAI Speech-to-Text와 구조화된 상담 분석 JSON
- 고객 전화번호 정규화와 중복 리드 감지
- 상담 히스토리, 현장 반응률, 문자/예약/콜백 액션
- 사용자가 직접 작성한 문자 내용을 OpenAI로 다듬고 Solapi로 발송
- Callbridge Custom Agent WebSocket 기반 브라우저 상담석
- 관리자 화면 기반 API 설정 저장

## 검증

```bash
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd audit --audit-level=high
```

참고 문서:

- Callbridge Developers: https://blumnai.oopy.io/callbridge/developers
- Callbridge Agent WebSocket: https://blumnai.oopy.io/325c0b11-04dd-801f-bad8-c196227ffe18
- Callbridge Audio Stream: https://blumnai.oopy.io/325c0b11-04dd-800a-91de-f5a8e4bdb169
- Callbridge STT Result: https://blumnai.oopy.io/325c0b11-04dd-8061-b60f-c85faf0bbe73
- OpenAI Realtime transcription: https://developers.openai.com/api/docs/guides/realtime-transcription

## Render 배포

- Render Web Service 배포 가이드: [docs/render-deploy-guide.md](docs/render-deploy-guide.md)
