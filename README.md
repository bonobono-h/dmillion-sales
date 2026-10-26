# 디밀리언 영업 관리

영업팀이 아이디로 로그인해서 쓰는 영업 지도입니다.

- **화면**: 이 저장소의 파일입니다. GitHub Pages가 보여 줍니다. 고객 데이터는 들어 있지 않습니다.
- **로그인·데이터·파일**: Supabase에 있습니다. 로그인한 영업팀만 읽을 수 있고, 권한에 따라 고칠 수 있는 범위가 다릅니다.

| 권한 | 할 수 있는 일 |
|---|---|
| 관리자 | 모든 수정·삭제, 공급사·매입가·견적, 목표, 사람 추가와 권한 변경, 백업·가져오기 |
| 영업담당 | 업체·미팅·과제·지원사업 입력과 수정, 연락처 열람, 변경 기록 열람 |
| 보기 전용 | 업체·히스토리·지도·보고 보기. 연락처는 가려지고 엑셀에도 빠집니다 (새 계정의 기본값) |

---

## 처음 한 번 설정

### 1. Supabase
1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다. 지역은 Seoul(Northeast Asia)로 합니다.
2. **SQL Editor → New query**에 `schema.sql` 내용을 전부 붙여 넣고 **Run**을 누릅니다.
3. **Authentication → Sign In / Providers**에서 **Allow new users to sign up**은 켜고, Email의 **Confirm email**은 끕니다. 새로 가입한 사람은 관리자가 승인하기 전까지 아무것도 볼 수 없습니다.
4. **Project Settings → API**에서 Project URL과 Publishable 키(예전 anon 키)를 `config.js`에 넣습니다.
   - Publishable 키는 원래 공개용이라 저장소에 올려도 됩니다.
   - **Secret 키·service_role 키·DB 비밀번호는 절대 어디에도 넣지 마세요.**

### 2. 첫 관리자
1. 사이트의 **처음이면 가입하기**로 본인 계정을 만듭니다. Supabase **Authentication → Users → Add user**로 만들어도 됩니다.
2. SQL Editor에서 다음 한 줄을 실행합니다. 아이디는 메일의 @ 앞부분입니다.
   ```sql
   update public.members set role = 'admin', name = '윤홍렬' where login = 'hryoon';
   ```

### 3. 화면 올리기 (GitHub Pages)
1. 저장소 **Settings → Pages**로 갑니다.
2. Source를 **Deploy from a branch**, 브랜치를 `main`, 폴더를 `/ (root)`로 정하고 저장합니다.
3. 1~2분 뒤 `https://<깃허브아이디>.github.io/<저장소이름>/` 주소로 열립니다.

### 4. 기존 데이터 옮기기 (한 번만)
1. 관리자로 로그인한 뒤 **권한·변경 기록** 탭을 엽니다.
2. **가져오기 (JSON)**를 누르고 전달받은 `영업관리_데이터_이전용.json`을 고릅니다.
3. 다 들어가면 새로고침합니다.

> 이 JSON 파일에는 고객 연락처가 들어 있습니다. 저장소에 올리지 말고, 가져온 뒤에는 지우거나 안전한 곳에 보관하세요.

---

## 사람 추가 (각자 가입 → 관리자 승인)

1. 영업팀에게 사이트 주소를 보냅니다. 각자 로그인 화면의 **처음이면 가입하기**에서 아이디(회사 메일 @ 앞부분), 이름, 비밀번호를 정합니다.
2. 가입하면 '승인 대기' 상태가 됩니다. 이때는 아무 데이터도 볼 수 없습니다.
3. 관리자 화면 오른쪽 위에 **승인 대기 N명**이 뜹니다. 누르면 사람 관리로 갑니다. 본인이 맞는지 확인하고 권한(영업담당·보기 전용)을 골라 **저장**합니다.
4. 가입한 사람이 **승인됐는지 다시 확인**을 누르면 바로 들어갑니다.

- 사람을 내보낼 때는 권한을 '승인 대기'로 바꾸면 바로 막힙니다. 계정을 아예 지우려면 Supabase **Authentication → Users**에서 삭제합니다.
- Supabase 설정: **Authentication → Sign In / Providers**에서 **Allow new users to sign up**은 켜고, Email 항목의 **Confirm email**은 끕니다. 회사 메일로 인증 메일이 가지 않아도 가입되게 하는 설정입니다. 대신 관리자 승인으로 막습니다.

## 백업

무료 요금제에는 자동 백업이 없습니다. 한 주에 한 번 **권한·변경 기록 → 전체 백업 내려받기**를 눌러 받아 두세요.

## 알아 둘 점
- Supabase 무료 프로젝트는 7일 동안 사용이 거의 없으면 일시 정지됩니다. 평일에 매일 쓰면 해당되지 않습니다. 정지돼도 대시보드에서 **Resume project**를 누르면 데이터가 그대로 돌아옵니다.
- 녹취를 AI로 정리하는 기능은 이 서버에서는 꺼져 있습니다. 미팅 기록은 직접 쓰거나 '영업 내역 입력함' 시트에 쓰면 됩니다.
- 하루 2번 업무 센터·입력함 동기화는 홍의 PC에서 로그인된 이 화면을 통해 들어갑니다.

## 파일 구성
- `index.html`: 화면
- `bridge.js`: 로그인과 Supabase 연결
- `config.js`: Supabase 주소와 공개 키
- `supabase.js`: supabase-js 2.117.3
- `map.json`: 시도·시군구 지도
- `schema.sql`: 테이블·권한·파일함 설정 (Supabase SQL Editor에서 실행)
- 엑셀(SheetJS 0.18.5)과 글꼴(Pretendard 1.3.9, SIL OFL)은 공용 CDN에서 불러옵니다.
