# Password Manager

비밀번호 강도 분석, 사이트별 규칙 기반 랜덤 비밀번호 생성, 암호화된 힌트 메모장을 제공하는 Node.js 프로젝트입니다.

## 주요 기능

- 회원가입 및 로그인
- bcrypt 기반 비밀번호 해시 저장
- JWT 기반 로그인 유지
- 비밀번호 강도 분석
- 사이트별 규칙을 반영한 랜덤 비밀번호 생성
- AES-256-GCM 방식으로 암호화된 힌트 메모 저장
- 힌트 검색, 수정, 삭제, 즐겨찾기
- Supabase 또는 SQLite 저장소 지원

## 기술 스택

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: Supabase 또는 SQLite
- Auth: bcryptjs, JWT
- Encryption: Node.js crypto AES-256-GCM

## 실행 방법

```powershell
npm.cmd install
npm.cmd start
```

실행 후 브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:3000
```

## 환경변수

프로젝트 루트에 `.env` 파일을 만들고 아래 값을 설정할 수 있습니다.

```env
PORT=3000
JWT_SECRET=change-this-jwt-secret
ENCRYPTION_KEY=change-this-encryption-secret
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 모두 있으면 Supabase를 사용합니다. 두 값이 없으면 기존처럼 로컬 SQLite 파일(`database.sqlite`)을 사용합니다.

## Supabase 설정

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor를 엽니다.
3. [supabase-schema.sql](./supabase-schema.sql) 내용을 붙여넣고 실행합니다.
4. Project Settings > API에서 `Project URL`을 복사해 `SUPABASE_URL`에 넣습니다.
5. 같은 화면의 `service_role` 키를 복사해 `SUPABASE_SERVICE_ROLE_KEY`에 넣습니다.

`service_role` 키는 서버에서만 사용해야 합니다. 브라우저 코드에 넣거나 GitHub에 올리면 안 됩니다.

## Render 배포

Render Web Service 설정은 아래처럼 둡니다.

```text
Environment: Node
Build Command: npm install
Start Command: npm start
```

Render의 Environment 메뉴에서 아래 환경변수를 추가합니다.

```env
JWT_SECRET=긴_랜덤_문자열
ENCRYPTION_KEY=긴_랜덤_문자열
SUPABASE_URL=Supabase_Project_URL
SUPABASE_SERVICE_ROLE_KEY=Supabase_service_role_key
```

코드를 GitHub에 push한 뒤 Render에서 `Manual Deploy > Deploy latest commit`을 누르면 최신 코드로 배포됩니다.

## 보안 참고

- 로그인 비밀번호는 원문으로 저장하지 않고 bcrypt 해시로 저장합니다.
- 힌트 메모는 AES-256-GCM으로 암호화해서 저장합니다.
- 실제 비밀번호 자체를 저장하는 프로젝트가 아니라, 기억을 돕는 힌트만 저장하는 구조입니다.
- `.env`, `database.sqlite`, `node_modules`는 GitHub에 올리지 않는 것이 좋습니다.
