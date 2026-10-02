# MiroFish 로컬 초기 설정 및 실행 (한국어)

이 저장소의 MiroFish 코드는 **`mirofish/`** 디렉터리에 있습니다.  
아래 순서대로 진행하면 프론트(3000)와 백엔드(5001)를 로컬에서 실행할 수 있습니다.

---

## 1. 사전 준비

| 도구 | 버전 | 확인 명령 |
|------|------|-----------|
| Node.js | 18 이상 | `node -v` |
| Python | **3.11 ~ 3.12** | `python3.12 --version` |
| uv | 최신 | `uv --version` |

macOS에서 기본 `python3`가 3.9인 경우가 많습니다. 백엔드는 3.11~3.12만 지원하므로 **3.12를 uv에 지정**하세요.

```bash
export UV_PYTHON="$HOME/.local/bin/python3.12"
# 또는: export UV_PYTHON="$(which python3.12)"
```

셸 설정(`~/.zshrc` 등)에 넣어 두면 편합니다.

---

## 2. 환경 변수 (.env)

API 키는 **Git에 올리지 않습니다** (`.gitignore`에 포함됨).

```bash
cd mirofish
cp .env.example .env
```

`mirofish/.env`를 열어 다음을 채웁니다.

| 변수 | 설명 |
|------|------|
| `LLM_API_KEY` | OpenAI 호환 LLM API 키 |
| `LLM_BASE_URL` | API 베이스 URL (OpenAI면 `https://api.openai.com/v1`) |
| `LLM_MODEL_NAME` | 모델 이름 |
| `ZEP_API_KEY` | [Zep Cloud](https://app.getzep.com/) API 키 (그래프·메모리) |

시뮬레이션은 LLM 호출량이 큽니다. 처음에는 라운드를 적게 두고 테스트하는 것을 권장합니다.

---

## 3. 의존성 설치

**반드시 `mirofish/` 루트**에서 실행합니다.

```bash
cd mirofish
export UV_PYTHON="$HOME/.local/bin/python3.12"   # 3.12 경로에 맞게 수정

# 한 번에 (루트 + frontend npm + backend uv)
npm run setup:all
```

나눠서 설치할 경우:

```bash
npm run setup          # npm (루트 + frontend)
npm run setup:backend  # backend Python 패키지 (uv sync)
```

---

## 4. 실행

```bash
cd mirofish
export UV_PYTHON="$HOME/.local/bin/python3.12"
npm run dev
```

| 서비스 | 주소 |
|--------|------|
| 웹 UI | http://localhost:3000 |
| 백엔드 API | http://localhost:5001 |

개별 실행:

```bash
npm run backend   # 백엔드만
npm run frontend  # 프론트만
```

종료: 터미널에서 `Ctrl+C`

---

## 5. Docker로 실행 (선택)

소스 빌드 대신 공식 이미지를 쓸 때:

```bash
cd mirofish
cp .env.example .env   # 키 설정
docker compose up -d
```

포트는 동일하게 **3000 / 5001** 입니다.

---

## 6. 자주 나는 문제

### `LLM_API_KEY` / `ZEP_API_KEY` 미설정

백엔드 시작 시 설정 오류로 종료됩니다. `mirofish/.env` 위치와 변수명을 확인하세요.

### Python 버전 오류 (`requires-python >=3.11`)

`UV_PYTHON`을 3.11 또는 3.12로 설정한 뒤 `npm run setup:backend`를 다시 실행하세요.

### 포트가 이미 사용 중

3000 또는 5001을 쓰는 프로세스를 종료하거나, `.env`에서 `FLASK_PORT` 등을 변경하세요.

### 프론트가 API에 연결되지 않음

기본 API 주소는 `http://localhost:5001` 입니다. 백엔드가 먼저 떠 있는지 확인하세요.

---

## 7. Git 관련

- **커밋하지 말 것:** `.env`, `node_modules/`, `backend/.venv/`, `backend/uploads/`, 로그
- **커밋해도 됨:** 소스 코드, `mirofish/.env.example`

원본 프로젝트: [666ghj/MiroFish](https://github.com/666ghj/MiroFish)
