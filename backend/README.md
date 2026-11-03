# CRM 자료 업데이트

## AI 영업 Agent 함수

- `crm-agent-extract/index.ts`는 로그인된 `admin` 또는 `sales` 사용자만 호출할 수 있습니다.
- 배포 시 `verify_jwt=false`를 사용하지만 함수 내부에서 Supabase Auth `/user`와 실제 `members.role`을 모두 확인합니다. 이는 최신 비대칭 사용자 토큰도 함수 코드에서 검증하기 위한 구성입니다.
- Supabase Edge Function Secret에 `OPENAI_API_KEY`를 설정하면 OpenAI Responses API의 Structured Outputs로 초안을 만듭니다. 선택적으로 `OPENAI_MODEL`을 설정할 수 있으며 기본값은 `gpt-6-astra`입니다.
- `SUPABASE_SECRET_KEYS`의 `default` 키를 우선 사용하고, 기존 프로젝트 호환을 위해 `SUPABASE_SERVICE_ROLE_KEY`를 대체 경로로만 지원합니다. 어느 키도 브라우저나 GitHub에 넣지 않습니다.
- 입력 원문과 최대 5개 후보 업체명만 AI로 전달하며 `store:false`를 사용합니다. 고객 연락처와 전체 회사 목록은 전송하지 않습니다.
- AI 키 미설정·일시 실패 시 `crm2-agent-core.mjs`의 기본 규칙 분석으로 전환합니다. 분석만으로 DB를 쓰지 않으며 최종 저장은 기존 `crm_intake_approve` 승인 함수가 담당합니다.

배포 대상 파일: `backend/crm-agent-extract/index.ts`, `crm2-agent-core.mjs`.

## 운영 전제

- 운영 적용 대상: 기존 `dmillion-sales` Supabase 프로젝트. 새 유료 프로젝트는 만들지 않습니다.
- `intake-schema.sql`은 개인 자료 보관함, 비공개 원본 파일함, 원자적 CRM 승인 함수, 서버 전용 메일 연결 저장소, 30분 수집 작업을 추가합니다.
- 원문은 소유자이며 영업/관리자 역할인 사용자만 읽습니다. 기존 고객사와 문서함의 권한은 유지합니다.
- 메일 앱 비밀번호는 Supabase Vault에 저장합니다. 브라우저, GitHub, CRM 공개 프로필, 로그에 저장하거나 반환하지 않습니다.
- 기본 수집 범위는 초기 최근 7일, 이후 UID 기준 증분입니다. 등록된 고객 연락처와 일치하지 않는 메일은 수집하지 않습니다.
- IMAP은 `imap.daum.net:993` TLS, EXAMINE, BODY.PEEK만 사용합니다. 읽음·삭제·이동·발송 동작은 없습니다.
- 받은메일과 `\\Sent` 속성(또는 표준 Sent 이름) 폴더를 대상으로 합니다. 보낸메일함을 찾지 못하면 상태 화면에 부분 수집 오류를 남깁니다.
- 한 번에 폴더당 최대 30개, 전체 45개 메시지를 처리하고 커서를 저장합니다. 실패한 메시지부터 다음 수집 때 재시도합니다.
- 2.5MB 초과 메일은 헤더만 보관하고 본문 미수집을 표시합니다. 첨부파일은 이름·형식만 표시하며 원문 메일에서 확인합니다.

## 배포

1. `intake-schema.sql`을 검토 후 적용합니다. 기존 레코드의 일괄 갱신·삭제는 없습니다.
2. `crm-mail-sync/index.ts`를 Edge Function `crm-mail-sync`로 배포합니다. 함께 `imap.mjs`, 루트 `crm2-intake-core.mjs`를 포함합니다.
3. `verify_jwt=false`는 예약 호출을 위해 필요합니다. 함수는 일반 요청에서 Supabase Auth `/user` 검증 및 실제 `members.role` 확인, 예약 요청에서는 Vault의 랜덤 키 검증을 직접 수행합니다. 비인증 요청은 수집하지 않습니다.
4. 프론트 `crm2-intake.js`, `crm2-intake-core.mjs`, `crm2.js`, `crm2.css`, `crm2.html`을 기존 GitHub Pages에 배포합니다.
5. 사용자 본인이 CRM 자료 업데이트 → 다음메일 연결에서 IMAP 로그인 ID·앱 비밀번호를 입력합니다. 메일 계정이 없으면 예약 작업은 외부 호출을 하지 않습니다.

## 자료 처리와 제한

- 단순 규칙 기반 업체 매칭·문서 분류·명시된 업무 추출입니다. 외부 AI 서비스로 원문을 전송하지 않습니다.
- EML은 PostalMime 4.2.0, PDF는 pdfjs-dist 4.10.38(최대 30쪽), DOCX는 Mammoth 1.8.0으로 브라우저에서 텍스트를 읽습니다. 스캔 OCR·이미지 판독은 포함하지 않습니다.
- 검토 화면의 정리본 기본값은 원문 앞부분이며 AI 요약이 아닙니다. 공유할 내용을 직접 확인합니다.
- 실제 일시, 업체, 정리본 및 선택한 업무를 승인하면 하나의 DB 트랜잭션으로 기록됩니다. 재시도는 기존 결과를 반환합니다.
- 문서 원본은 개인 보관합니다. 사용자가 '업체 문서함에도 등록'을 선택할 때만 기존 `files` 버킷으로 복사하여 기존 영업관리 권한으로 공유합니다.
- 계약·선정·금액·단계는 자동 변경하지 않습니다. 이메일 수신만으로 업무 완료 처리하지 않습니다.
- 수집 중지는 다음 예약 실행부터 적용됩니다. 이미 시작된 읽기 작업은 최대 55초 이내 끝날 수 있습니다. 연결 재사용을 위해 암호화된 연결 정보와 기존 자료는 유지합니다.

## 검증

`node --test tests/*.test.mjs`

운영 적용 뒤 RLS, RPC 중복 승인/원자성, 인증 없는 함수 호출 차단, 예약 작업 상태를 확인합니다. 테스트용 업체·자료는 트랜잭션 안에서만 생성하고 롤백합니다.
