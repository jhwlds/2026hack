# MiroFish 초기 세팅 가이드 (2026hack)

이 문서는 `2026hack` 레포에 MiroFish를 서브모듈로 추가하고, 로컬에서 프론트/백엔드를 실행하기까지의 과정을 정리한 것입니다.

## 사전 요구 사항

| 도구 | 버전 | 확인 명령 |
|------|------|-----------|
| **Node.js** | 18 이상 | `node -v` |
| **Python** | 3.11 ~ 3.12 | `uv run python --version` (설치 후) |
| **uv** | 최신 | `uv --version` |
| **git** | - | `git --version` |

> macOS 기본 `python3`(3.9.x)는 **사용하지 않습니다**. MiroFish 백엔드는 Python **3.11 이상, 3.13 미만**만 지원합니다.

---

## 1. 레포 클론

```bash
cd ~/Desktop/2026hack   # 원하는 작업 디렉터리
git clone https://github.com/jhwlds/2026hack.git
cd 2026hack
```

---

## 2. MiroFish 서브모듈 추가

처음 한 번만 실행합니다. (이미 서브모듈이 있으면 3번으로 이동)

```bash
mkdir -p services
git submodule add https://github.com/666ghj/MiroFish.git services/mirofish
git submodule update --init --recursive
```

이미 클론된 레포를 다른 PC에서 받을 때:

```bash
git clone --recurse-submodules https://github.com/jhwlds/2026hack.git
# 또는
git submodule update --init --recursive
```

---

## 3. Python: `uv`로 3.12 설치 (Homebrew 대신 권장)

공용 Mac에서 Homebrew(`/opt/homebrew`) 권한 오류가 나는 경우가 많습니다. **`uv`는 사용자 홈에 Python을 설치**하므로 Brew 수정 없이 진행할 수 있습니다.

### 3.1 uv 설치

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

설치 후 PATH 반영 (새 터미널을 열거나):

```bash
source $HOME/.local/bin/env
```

### 3.2 Python 3.12 설치

```bash
uv python install 3.12
```

> `python3.12 -m venv`를 쓰려면 시스템 PATH에 `python3.12`가 있어야 합니다.  
> `uv python install`만 해도 **`backend`에서 `uv sync`가 자동으로 3.12 venv**를 만듭니다. 별도 `venv` 생성은 필수 아님.

### 3.3 백엔드 의존성 설치

**`pyproject.toml`은 `backend` 폴더에만 있습니다.** `mirofish` 루트에서 `uv sync`하면 오류가 납니다.

```bash
cd services/mirofish/backend
uv sync
```

성공 시 `backend/.venv`가 생성되고 패키지가 설치됩니다.

---

## 4. 환경 변수 (.env)

```bash
cd services/mirofish
cp .env.example .env
```

`.env`를 열어 아래 값을 채웁니다.

| 변수 | 설명 |
|------|------|
| `LLM_API_KEY` | OpenAI 호환 LLM API 키 |
| `LLM_BASE_URL` | API 베이스 URL (예: DashScope compatible mode) |
| `LLM_MODEL_NAME` | 모델 이름 (예: `qwen-plus`) |
| `ZEP_API_KEY` | [Zep Cloud](https://app.getzep.com/) API 키 |

선택: `LLM_BOOST_*` (가속용 LLM, 없으면 `.env`에 넣지 않음)

---

## 5. Node 의존성 (프론트 + 루트)

`mirofish` 루트에서 한 번에:

```bash
cd services/mirofish
npm run setup:all
```

이 명령은 다음을 수행합니다.

- 루트 + `frontend`의 `npm install`
- `backend`에서 `uv sync`

단계별로 하려면:

```bash
npm run setup          # Node만
npm run setup:backend  # uv sync만
```

---

## 6. 개발 서버 실행

```bash
cd services/mirofish
npm run dev
```

| 서비스 | URL |
|--------|-----|
| **프론트엔드 (Vite)** | http://localhost:3000/ |
| **백엔드 (Flask)** | http://127.0.0.1:5001 |

브라우저에서는 **프론트 주소(`localhost:3000`)** 로 접속합니다.

종료: `Ctrl+C`

---

## 7. 정상 동작 확인

백엔드 로그 예시:

- `MiroFish Backend 启动完成`
- `Running on http://127.0.0.1:5001`
- `GET /api/simulation/history?limit=20` → **200**

프론트 로그 예시:

- `VITE ... ready`
- `Local: http://localhost:3000/`

---

## 자주 겪는 문제

### `uv sync`: No `pyproject.toml` found

- **원인:** `services/mirofish` 루트에서 실행함.
- **해결:** `cd backend` 후 `uv sync`, 또는 `npm run setup:backend`.

### `brew install python@3.12` 실패 (권한 / git)

- `/opt/homebrew` 소유자가 다른 사용자일 때 쓰기 불가.
- Brew의 `fatal: not in a git directory`는 Homebrew 설치 자체 이슈일 수 있음.
- **이 프로젝트는 Brew 없이 `uv`만으로 충분합니다.**

### `sudo chown ...` 에 `...` 포함

- Brew가 안내한 **전체 경로 목록**을 그대로 써야 합니다. `...`는 예시가 아니라 잘못 붙인 문자입니다. Brew 수정이 꼭 필요할 때만, 안내 문구 전체를 복사해 사용하세요.

### 백엔드 `GET /` → 404

- API 서버만 있고 루트 페이지는 없을 수 있습니다. **정상**입니다. UI는 3000 포트를 사용합니다.

### `zep_cloud` SyntaxWarning

- 서드파티 패키지 docstring 경고입니다. 실행에는 보통 영향 없습니다.

### npm audit / install-scripts 경고

- `setup:all` 후 나오는 vulnerability·`esbuild` 스크립트 경고는 초기 세팅 단계에서는 무시해도 되는 경우가 많습니다. 필요 시 `npm audit`으로만 검토합니다.

---

## 명령어 요약 (처음부터)

```bash
git clone https://github.com/jhwlds/2026hack.git
cd 2026hack
mkdir -p services
git submodule add https://github.com/666ghj/MiroFish.git services/mirofish
git submodule update --init --recursive

curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env

cd services/mirofish
uv python install 3.12
cd backend && uv sync && cd ..
cp .env.example .env
# .env 편집 (API 키)

npm run setup:all
npm run dev
```

---

## 디렉터리 구조 (참고)

```
2026hack/
├── README.md
└── services/
    └── mirofish/          # MiroFish 서브모듈
        ├── .env
        ├── .env.example
        ├── package.json
        ├── backend/
        │   ├── pyproject.toml
        │   └── .venv/       # uv sync 후 생성
        └── frontend/
```
