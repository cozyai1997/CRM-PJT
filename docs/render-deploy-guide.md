# Render 배포 가이드

이 CRM은 Callbridge 상담석 WebSocket을 받아야 하므로 Render의 Static Site가 아니라 Web Service로 배포합니다.

## 1. GitHub에 코드 올리기

1. 이 프로젝트를 GitHub 저장소에 push합니다.
2. Render에서 해당 GitHub 저장소를 연결할 수 있어야 합니다.

## 2. Render Web Service 만들기

1. Render Dashboard에서 `New +`를 누릅니다.
2. `Blueprint`를 선택하면 루트의 `render.yaml` 설정을 읽어서 서비스가 만들어집니다.
3. Blueprint를 쓰지 않고 직접 만들 경우에는 `Web Service`를 선택합니다.
4. 저장소는 `cozyai1997/CRM-PJT` 또는 현재 CRM 저장소를 선택합니다.
5. Runtime은 `Node`로 둡니다.
6. Build Command는 아래처럼 입력합니다.

```bash
npm ci --include=dev && npm run build
```

7. Start Command는 아래처럼 입력합니다.

```bash
npm run start
```

8. Health Check Path는 아래처럼 입력합니다.

```text
/api/health
```

## 3. 환경변수 입력

Render의 `Environment` 메뉴에서 아래 값을 입력합니다. API 키는 코드에 저장하지 않고 Render에만 저장합니다.

| Key | 값 |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `OPENAI_API_KEY` | OpenAI API 키 |
| `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` |
| `OPENAI_ANALYSIS_MODEL` | `gpt-5-mini` |
| `OPENAI_REALTIME_TRANSCRIPTION_MODEL` | `gpt-realtime-whisper` |
| `SOLAPI_API_KEY` | Solapi API Key |
| `SOLAPI_API_SECRET` | Solapi API Secret |
| `SOLAPI_SENDER_NUMBER` | 등록한 Solapi 발신번호 |
| `CALLBRIDGE_API_KEY` | Callbridge API Key |
| `CALLBRIDGE_BASE_URL` | `https://bnd.happytalk.io/api/openapi` |
| `CALLBRIDGE_DISPLAY_NUMBER` | 고객이 전화할 Callbridge 등록 수신번호 |
| `SUPABASE_URL` | `https://dmqguebuvssjbiahumhp.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase Project API publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `API_SETTINGS_ENCRYPTION_KEY` | 32바이트 base64 암호화 키 |

`CALLBRIDGE_AGENT_API_KEY`는 입력하지 않아도 됩니다. 앱이 `CALLBRIDGE_API_KEY`를 Agent 인증 키로 자동 사용합니다.

암호화 키는 로컬 PowerShell에서 아래 명령으로 만들 수 있습니다.

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

## 3-1. Supabase 관리자 계정 만들기

1. Supabase Dashboard에서 `Authentication` → `Users`로 이동합니다.
2. `Add user`로 관리자 이메일과 비밀번호를 만듭니다.
3. SQL Editor에서 아래 SQL을 실행해 관리자 권한을 부여합니다.

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"crm_role":"admin"}'::jsonb
where email = '관리자이메일@example.com';
```

4. Render 배포 CRM에서 `API 설정`을 누르고 해당 이메일/비밀번호로 로그인합니다.
5. OpenAI, Solapi, Callbridge API 키를 CRM 관리자 화면에서 저장합니다.

## 4. 배포 확인

배포가 끝나면 Render URL에서 아래 주소를 엽니다.

```text
https://서비스이름.onrender.com/api/health
```

`ok: true`가 보이면 서버가 켜진 상태입니다.

## 5. Callbridge WebSocket 주소 등록

CRM 화면을 Render 주소로 엽니다.

```text
https://서비스이름.onrender.com/?settings=api
```

Callbridge 간편 연결 영역에 자동 생성된 WebSocket 주소가 보입니다.

```text
wss://서비스이름.onrender.com/api/callbridge/agent
```

이 주소를 Callbridge 관리자 페이지의 Custom Agent WebSocket 주소로 등록합니다.

## 6. 통화 테스트 순서

1. Render 서비스가 켜져 있는지 확인합니다.
2. Callbridge 관리자 페이지에 WebSocket 주소가 등록되어 있는지 확인합니다.
3. CRM 상담석에서 `상담석 준비`를 누릅니다.
4. 고객 휴대폰으로 Callbridge 등록 수신번호에 전화합니다.
5. CRM 화면에 수신콜이 뜨면 `받기`를 누릅니다.
6. 헤드셋과 마이크로 통화가 되는지 확인합니다.

## 주의사항

- 무료 인스턴스나 절전 상태가 있는 플랜은 첫 전화 수신이 늦거나 실패할 수 있습니다. 상담석 용도는 항상 켜져 있는 유료 Web Service를 권장합니다.
- 현재 파일 기반 저장소는 Render 재배포/재시작 시 데이터 보존에 한계가 있습니다. 운영용으로는 Render Disk 또는 DB 연결을 추가해야 합니다.
- 채팅이나 화면에 노출된 API 키는 운영 전에 새 키로 재발급하는 것을 권장합니다.
