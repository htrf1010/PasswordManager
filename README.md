# Password Manager

비밀번호 강도 분석, 사이트별 비밀번호 규칙 적용, 랜덤 비밀번호 생성, 암호화된 힌트 메모장을 제공하는 웹 기반 비밀번호 보안 프로젝트입니다.

## 주요 기능

- 회원가입 / 로그인
- bcrypt 기반 비밀번호 해시 저장
- JWT 기반 로그인 유지
- 실시간 비밀번호 강도 분석
- 흔한 비밀번호, 반복 문자, 연속 문자 패턴 감지
- 사이트별 비밀번호 규칙 적용
- 사이트 규칙을 반영한 랜덤 비밀번호 생성
- 비밀번호가 아닌 힌트만 AES-256-GCM 방식으로 암호화 저장
- 힌트 검색, 수정, 삭제, 즐겨찾기
- 다크 테마 UI

## 기술 스택

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: SQLite
- Auth: bcryptjs, JWT
- Encryption: Node.js crypto AES-256-GCM

## 프로젝트 구조

```text
Password_Manager/
├── database/
│   └── db.js
├── middleware/
│   └── auth.js
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   ├── index.html
│   └── password-rules.json
├── routes/
│   ├── auth.js
│   ├── hint.js
│   └── password.js
├── server.js
├── package.json
└── README.md
```

## 실행 방법

### 1. 의존성 설치

```powershell
npm.cmd install
```

### 2. 환경변수 설정

프로젝트 루트에 `.env` 파일을 만들고 아래 내용을 입력합니다.

```env
PORT=3000
JWT_SECRET=change-this-jwt-secret
ENCRYPTION_KEY=change-this-encryption-secret
```

`JWT_SECRET`과 `ENCRYPTION_KEY`는 실제 사용 시 다른 사람이 추측하기 어려운 긴 문자열로 바꾸는 것이 좋습니다.

### 3. 서버 실행

```powershell
npm.cmd start
```

실행 후 브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:3000
```

## 사용 방법

1. 회원가입 후 로그인합니다.
2. 비밀번호 강도 분석기에서 비밀번호를 입력해 점수와 위험 요소를 확인합니다.
3. 랜덤 비밀번호 생성기에서 사이트를 선택하면 해당 사이트 규칙이 자동으로 반영됩니다.
4. 힌트 메모장에서 비밀번호 원문이 아닌 본인만 알 수 있는 힌트를 저장합니다.

## 보안 설계

- 로그인 비밀번호는 원문으로 저장하지 않고 bcrypt 해시로 저장합니다.
- 힌트는 AES-256-GCM 방식으로 암호화되어 SQLite DB에 저장됩니다.
- 실제 비밀번호 원문은 저장하지 않습니다.
- 로그인 상태 유지를 위해 JWT 토큰을 사용합니다.

## DB 저장 위치

SQLite 데이터베이스는 실행 시 프로젝트 루트에 생성됩니다.

```text
database.sqlite
```

이 파일에는 회원 정보와 암호화된 힌트가 저장됩니다.

## 간단 배포(Render)

이 프로젝트는 Node.js Express 서버이므로 Render Web Service로 간단히 배포할 수 있습니다.

### 1. GitHub에 최신 코드 push

```powershell
git add .
git commit -m "Prepare Render deployment"
git push origin main
```

### 2. Render에서 Web Service 생성

1. Render에 로그인합니다.
2. `New +` 버튼을 누릅니다.
3. `Web Service`를 선택합니다.
4. GitHub 저장소 `PasswordManager`를 연결합니다.
5. 아래 설정을 확인합니다.

```text
Environment: Node
Build Command: npm install
Start Command: npm start
```

이 저장소에는 `render.yaml` 파일이 포함되어 있어 Blueprint 방식으로도 배포할 수 있습니다.

### 3. 환경변수

Render 환경변수에 아래 값이 필요합니다.

```env
JWT_SECRET=긴_랜덤_문자열
ENCRYPTION_KEY=긴_랜덤_문자열
```

`render.yaml`을 사용하면 Render가 두 값을 자동 생성하도록 설정되어 있습니다.

### 4. SQLite 배포 주의

간단 배포에서는 SQLite 파일이 서버 파일 시스템에 생성됩니다.
무료 배포 환경에서는 재배포/재시작 시 데이터가 유지되지 않을 수 있으므로, 발표용 링크나 기능 시연용으로 사용하는 것을 권장합니다.

데이터를 안정적으로 유지하려면 Supabase/PostgreSQL 같은 외부 DB로 이전하는 것이 좋습니다.

## 발표 시 강조할 점

- 단순 비밀번호 저장 프로그램이 아니라, 비밀번호를 직접 저장하지 않고 힌트만 암호화해 저장합니다.
- 사이트별 규칙을 반영해 더 현실적인 비밀번호 생성이 가능합니다.
- 강도 분석에서 길이, 문자 종류, 반복 패턴, 연속 패턴, 흔한 비밀번호 여부를 함께 확인합니다.
- 로그인 비밀번호와 힌트 저장 방식에 각각 다른 보안 기술을 적용했습니다.

## 주의 사항

- `.env`, `database.sqlite`, `node_modules`는 GitHub에 올리지 않는 것이 좋습니다.
- 배포 환경에서 SQLite를 사용할 경우 서버 재시작이나 파일 시스템 정책에 따라 DB 유지가 불안정할 수 있습니다.
- 실제 서비스로 확장하려면 Supabase/PostgreSQL 같은 외부 DB 사용을 고려할 수 있습니다.
