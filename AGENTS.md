# AGENTS.md — Routen

> **Tài liệu hướng dẫn dành cho AI Coding Agents (Claude Code, Cursor, Kiro, Codex, Copilot...) khi tham gia phát triển, bảo trì và mở rộng repository `routen`.**

---

## 1. Định vị & Sứ mệnh (Overview & Positioning)

**Routen** là một **AI Router & Token Optimizer siêu nhẹ, local-first 100%**, được thiết kế chuyên biệt và tối ưu hóa tối đa cho các công cụ lập trình AI (**AI Coding Tools**): Claude Code, Cursor, Cline, OpenCode, Codex, GitHub Copilot.

### Bối cảnh & Lý do ra đời:
Dự án được tái cấu trúc và viết lại từ `9router` với tinh thần tinh gọn tối đa:
* **Loại bỏ Next.js SSR cồng kềnh:** Chuyển sang mô hình **Vite + React (SPA)** kết hợp **Node.js Express / Fastify**, khởi động trong `< 300ms`, build hoàn chỉnh chỉ mất **1–3 giây**.
* **Xóa bỏ triệt để tính năng thừa:** Loại bỏ hoàn toàn Media (sinh ảnh, âm thanh, video), dịch đa ngôn ngữ (i18n), chuyển đổi theme phức tạp, tích hợp LMS/học tập (9English), quản lý từ xa (9Remote), SAML SSO doanh nghiệp.
* **Tối ưu trải nghiệm phát triển (DX) trên cả Windows lẫn Linux:** Không phụ thuộc bash script (`.sh`), không gây lỗi native build C++ trên Windows PowerShell.

---

## 2. Chiến lược & Định hướng Cốt lõi (Strategic Pillars)

###  Trụ cột 1: 100% Local-First & Bảo mật Tuyệt đối (Zero Data Leakage)
* **Không telemetry / Không ping ngoại vi:** Cắt đứt hoàn toàn mọi kết nối gửi logs, thống kê hay kiểm tra license về server bên ngoài. Hoạt động độc lập và offline hoàn toàn.
* **Crypto Vault phần cứng:** API Key của các provider không bao giờ lưu dưới dạng plain-text. Được mã hóa bằng thuật toán **AES-256-GCM** với khóa sinh động từ Machine ID phần cứng (`node-machine-id`).

### ⚡ Trụ cột 2: Tối ưu Hiệu năng & Developer Experience (DX)
* **Single Gateway Port (20127):** Phục vụ cả API proxy streaming lẫn giao diện Web Dashboard tĩnh trên cùng 1 port.
* **Cross-Platform First-Class:** Mọi lệnh build, dev, script chạy đồng nhất trên Windows PowerShell và Linux (sử dụng Node scripts, `cross-env`, `concurrently`).
* **Database không gây nghẽn:** Sử dụng SQLite chế độ WAL (`node:sqlite` hoặc fallback pure JS `sql.js` / `better-sqlite3`), không bao giờ làm văng lỗi cài đặt môi trường thiếu C++ build tools.

### ✂️ Trụ cột 3: Tiết kiệm Token Chuyên biệt cho Coding (RTK Token Saver)
* **Nén Output của Tool:** Các agent lập trình thường xuyên gọi tool với dữ liệu đầu ra khổng lồ (`git diff`, `grep`, `file search`, `terminal/bash logs`). RTK tự động nhận diện và nén nội dung này in-place, giúp tiết kiệm **20% – 40% context window token**.
* **Nguyên tắc Fail-Open:** Nếu việc nén gặp lỗi hoặc payload không khớp, RTK phải giữ nguyên request gốc và bỏ qua nén, tuyệt đối không được làm gãy luồng xử lý hoặc ngắt request của người dùng.
* **Bảo toàn Trace lỗi:** Không bao giờ nén các tool result chứa `is_error` hoặc error trace để đảm bảo agent nhận diện đúng lỗi cần sửa.

### 🔄 Trụ cột 4: Điều phối Thông minh & Sẵn sàng Cao (Smart Routing & HA)
* **Dual-Protocol Translation:** Chuyển đổi linh hoạt 2 chiều giữa chuẩn Anthropic (`/v1/messages`) và chuẩn OpenAI (`/v1/chat/completions`), bảo toàn reasoning/thinking blocks và streaming SSE tool call.
* **Auto-Fallback:** Tự động chuyển đổi sang model/provider dự phòng khi model chính chạm ngưỡng rate limit (429) hoặc cạn quota.
* **Multi-Account Balancing:** Hỗ trợ xoay vòng round-robin nhiều tài khoản trên cùng một provider để tối đa hóa quota sử dụng.

### 🎯 Trụ cột 5: Hỗ trợ Cả Tool Mở Lẫn Tool Đóng
* **Direct Gateway:** Cho phép các tool hỗ trợ cấu hình Base URL trỏ thẳng về `http://127.0.0.1:20127` (Claude Code, Cursor OpenAI Override, Cline...).
* **Tùy chọn MITM Interceptor:** Hỗ trợ chặn bắt HTTPS nội bộ (Port 8443/443 với Root CA tự ký) cho các công cụ bị khóa cứng URL như GitHub Copilot hoặc các bản Cursor cũ.

---

## 3. Mục tiêu Trọng tâm & Non-Goals (Phạm vi)

###  MỤC TIÊU TẬP TRUNG (FOCUS OBJECTIVES):
1. **Độ trễ thấp nhất có thể:** Tối ưu hóa throughput của luồng SSE streaming, giảm tối đa overhead trung gian khi dịch request/response.
2. **Độ ổn định tối đa cho Coding Agent:** Đảm bảo tool definitions, tool arguments, reasoning thoughts không bị thất thoát qua các lớp adapter.
3. **Thống kê minh bạch:** Dashboard cung cấp số liệu trực quan về số token đã dùng, số token tiết kiệm được từ RTK, tỷ lệ lỗi và latency của từng provider.
4. **Vận hành nền mượt mà:** Khởi động / dừng dưới dạng daemon nền qua CLI (`routen start -d`, `routen stop`, `routen status`).

### ❌ NHỮNG GÌ TUYỆT ĐỐI KHÔNG LÀM (NON-GOALS):
1. **KHÔNG hỗ trợ sinh Media:** Tuyệt đối không thêm các provider sinh ảnh (DALL-E, Midjourney, Flux), Video, Âm thanh (TTS/STT), hay Music.
2. **KHÔNG thêm hệ thống i18n:** Toàn bộ giao diện Web Dashboard, CLI output và log thống nhất sử dụng **Tiếng Anh (English)** chuẩn kỹ thuật.
3. **KHÔNG hỗ trợ chuyển đổi nhiều theme:** Cố định duy nhất giao diện **Modern Dark Theme** tối giản, tương phản cao, chuyên nghiệp cho lập trình viên.
4. **KHÔNG đưa Next.js SSR quay trở lại:** Giữ vững kiến trúc SPA (React + Vite) tách biệt hoàn toàn với API server.
5. **KHÔNG tích hợp Cloud Sync / SaaS:** Không đồng bộ dữ liệu người dùng lên bất kỳ cloud hay máy chủ quản trị trung tâm nào.

---

## 4. Bản đồ Thư mục & Trách nhiệm (Directory Map)

```
routen/
├── bin/
│   └── routen.js                # Entry point cho CLI executable (chmod +x / Windows wrapper)
├── src/
│   ├── cli/                     # Quản lý tiến trình Daemon nền (PID file, start/stop/status)
│   ├── core/                    # Pure business logic (Hoàn toàn độc lập với HTTP framework)
│   │   ├── adapters/            # Bộ chuyển đổi payload giữa các AI format (OpenAI ⇄ Anthropic ⇄ Gemini)
│   │   ├── auth/                # Xử lý token nhà cung cấp, OAuth (Copilot, Gemini)
│   │   ├── router/              # Engine chọn model, luật định tuyến, load balancing đa tài khoản
│   │   ├── rtk/                 # RTK Token Saver (bộ nén tool result: diff, grep, terminal...)
│   │   └── scheduler/           # Cron reset quota định kỳ và ping healthcheck
│   ├── mitm/                    # [Tùy chọn] HTTPS proxy interceptor (Root CA, Hosts redirection)
│   ├── server/                  # HTTP Server & Gateway
│   │   ├── middlewares/         # Auth, logging, rate limiter, error handlers
│   │   ├── proxy/               # Xử lý chuyển tiếp request & SSE streaming upstream
│   │   ├── routes/              # REST API cho Dashboard (/api/models, /api/providers, /api/stats)
│   │   └── index.ts             # Server entry point (Port 20127, serve cả static Web)
│   ├── storage/                 # Data Layer & Security
│   │   ├── crypto/              # Mã hóa AES-256-GCM bảo vệ API Keys bằng Machine ID
│   │   ├── database.ts          # Kết nối SQLite với chế độ WAL
│   │   ├── migrations/          # Schema versioning cho SQLite
│   │   └── repositories/        # Truy vấn dữ liệu: providers, models, logs, token stats
│   ├── web/                     # Web Dashboard SPA (React 19 + Vite + Tailwind CSS)
│   │   ├── src/                 # Components, Pages, Stores (Zustand), Hooks
│   │   └── vite.config.ts       # Cấu hình Vite SPA build ra dist/web
│   └── shared/                  # Type definitions, Enums và Constants dùng chung toàn hệ thống
├── dist/                        # Output sau khi build (server & web static)
├── ARCHITECTURE.md              # Tài liệu chi tiết kiến trúc kỹ thuật
├── PLAN.md                      # Kế hoạch & Roadmap phát triển
└── package.json                 # Cấu hình dependencies & scripts
```

---

## 5. Vòng đời Request (Request Lifecycle)

```
Client (Claude Code / Cursor / Cline)
  │
  ▼
[Port 20127: Gateway Server]
  │
  ├─► Xác thực yêu cầu & Giải mã route (/v1/messages hoặc /v1/chat/completions)
  │
  ├─► [Core Router]:
  │     1. Nhận diện Client & Target Model
  │     2. Chọn Provider khả dụng (kiểm tra hạn mức & round-robin tài khoản)
  │
  ├─► [RTK Compressor] (Fail-Open):
  │     - Quét nội dung tool calls / tool results (git diff, terminal output...)
  │     - Nén in-place dữ liệu dư thừa, loại bỏ whitespace/headers rườm rà
  │
  ├─► [Format Adapter]:
  │     - Chuyển đổi payload client format ➔ format mà Upstream Provider yêu cầu
  │     - Giữ nguyên cấu trúc reasoning / tool calling
  │
  ├─► [Upstream Execution]:
  │     - Gửi request tới AI Provider (Anthropic, OpenAI, DeepSeek, Google...)
  │     - Nếu gặp lỗi 429/Quota: Tự động kích hoạt Fallback Model/Account tiếp theo
  │
  ├─► [Response Translation & Streaming]:
  │     - Nhận chunks từ Upstream SSE
  │     - Chuyển đổi format chunk ➔ format client mong đợi
  │     - Stream SSE trực tiếp về Client với độ trễ thấp nhất
  │
  └─► [Usage & Analytics Storage]:
        - Ghi nhận token input/output, số token tiết kiệm từ RTK vào SQLite (WAL mode)
```

---

## 6. Quy ước Bắt buộc cho Agent khi Sửa Code (Conventions & Invariants)

1. **TypeScript Nghiêm ngặt:**
   * Mọi file mới trong `src/` phải viết bằng TypeScript. Tuyệt đối không dùng `any` bừa bãi; hãy khai báo hoặc tái sử dụng interfaces trong `src/shared/`.
2. **Nguyên tắc Cross-Platform (Windows & Linux):**
   * Sử dụng hàm từ module `node:path` (`path.join`, `path.resolve`), không hardcode dấu gạch chéo `/` hay `\\`.
   * Mọi script build và công cụ hỗ trợ phải viết bằng Node.js script (`.ts` hoặc `.mjs`). **Tuyệt đối không tạo file `.sh`**.
3. **Nguyên tắc Bảo mật API Key:**
   * Mọi API Key hoặc OAuth token khi đi vào database **bắt buộc** phải qua `cryptoVault.encrypt()`.
   * Tuyệt đối không in raw API Key ra `console.log` hay lưu plain-text trong SQLite.
4. **RTK Fail-Open:**
   * Mọi hàm xử lý trong `src/core/rtk/` phải được bọc trong `try...catch` cẩn thận. Nếu xảy ra lỗi nén, lập tức trả về request body nguyên bản mà không được throw exception làm ngắt request.
5. **Giữ Vững Định vị Tinh Gọn:**
   * Không bao giờ thêm các thư viện cồng kềnh, không thêm i18n, không thêm theme-switching, không phục hồi Next.js SSR.
   * Nếu đề xuất tính năng mới, hãy tự đặt câu hỏi: *"Tính năng này có phục vụ trực tiếp cho AI Coding Tools và tăng tốc độ làm việc không?"* Nếu không, từ chối triển khai.
