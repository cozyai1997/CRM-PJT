# OpenAI Audio 반영 CRM 개발 워크플로우

## 1차 MVP

- 고객, 현장, 상담로그, 광고 유입, 예약, 문자, 콜백 데이터를 저장한다.
- 녹취 파일은 OpenAI Speech-to-Text 전사 경로로 처리한다.
- 녹취가 없으면 상담원이 입력한 전사 텍스트를 같은 분석 파이프라인으로 보낸다.
- AI 분석 결과는 고객 의도, 관심도, 주요 우려, 추천 스크립트, 위험 알림, 다음 액션, 담당자 요약, 리드 품질로 구조화한다.
- OpenAI API 키가 없으면 기능을 실패시키되 키 값은 로그와 응답에 노출하지 않는다.

## 2차 CTI/실시간 전사

- CTI/PBX 제공사에서 `call_id`, 통화 시작/종료 웹훅, 녹취 파일, 콜 전환, 3자 통화, 담당자 상태 API를 제공하는지 확인한다.
- 실시간 오디오 스트림을 받을 수 있으면 Realtime transcription 세션으로 transcript delta를 상담원 화면에 표시한다.
- 통화 종료 시 최종 전사와 AI 분석 결과를 상담로그에 저장한다.
- 담당자 연결 실패 시 콜백 태스크와 안내 문자 대기열을 생성한다.

## 3차 AI/분석 고도화

- 중복, 기접수, 스팸, 계약완료 고객을 분류하고 광고 캠페인별 품질 지표에 반영한다.
- 방문 가능성, 계약 가능성, 이탈 위험, 상담 품질 점수를 산출한다.
- 상담원 수정값, 방문 여부, 계약 여부, 이탈 사유를 저장해 상담 기준표와 추천 스크립트를 개선한다.

## 외부 API 책임

- OpenAI: 녹취 STT, 실시간 전사, 상담 분석
- Solapi: SMS, LMS, 알림톡, RCS 등 후속 메시지 발송
- CTI/PBX: 전화 연결, 콜 전환, 3자 통화
- Supabase: 운영 DB, 인증, Storage, Realtime
- Naver Maps: 현장 주소, 좌표, 길찾기 링크

## 참고 문서

- https://developers.openai.com/api/docs/guides/audio
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://developers.openai.com/api/docs/guides/realtime-transcription
- https://developers.openai.com/api/docs/guides/your-data
