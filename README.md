# 🎌 Game_tieng_nhat

Ứng dụng giúp ôn tập từ vựng, ngữ pháp và chữ Hán tiếng Nhật một cách dễ dàng cùng bạn bè.

---

## ✨ Giới thiệu

Game_tieng_nhat là một trò chơi học tập giúp:

- Ôn từ vựng tiếng Nhật
- Luyện các mẫu cấu trúc ngữ pháp 
- Ghi nhớ chữ Hán và âm Hán Việt
- Chơi theo nhóm trong lớp học hoặc cùng bạn bè

Phù hợp cho:
- Giáo viên dạy tiếng Nhật
- Học sinh ôn thi
- Lớp học đông người
- Học nhóm vui vẻ, tương tác

---

## 🎮 Tính năng chính

- Phát phiếu ngẫu nhiên cho người chơi
- Bảng ô hiển thị từ vựng theo chủ đề
- Nhấn 1 lần: hiện từ tiếng Nhật
- Nhấn 2 lần: hiện cách đọc, nghĩa tiếng Việt, âm Hán Việt
- Tùy chỉnh độ khó
- Hỗ trợ import/export file JSON
- Lưu dữ liệu bằng IndexedDB (offline)

---

## 📂 Cấu trúc dự án
```text
index.html
assets/
├── css/
│   └── app.css
└── js/
    └── app.js

```
---

## 📥 Cách sử dụng

1. Tải project về máy
2. Mở file `index.html` bằng trình duyệt
3. Thêm người chơi
4. Import file chủ đề (JSON)
5. Phát phiếu và bắt đầu chơi

---

## 📦 Định dạng file JSON

### Topics
```json
{
  "topics": [
    {
      "id": "t1",
      "name": "Động vật",
      "icon": "🐾"
    }
  ]
}
Vocab
{
  "vocab": [
    {
      "id": "v1",
      "topicId": "t1",
      "jp": "猫",
      "kana": "ねこ",
      "meaning": "con mèo",
      "hanviet": "Miêu",
      "example": "猫が好きです。"
    }
  ]
}
```

🧠 Mục tiêu dự án

Tạo một công cụ học tiếng Nhật đơn giản, dễ sử dụng và mang tính tương tác cao để giúp việc học trở nên vui hơn.

👩‍🏫 Tác giả

Phát triển và sử dụng để tiếp thu tiếng nhật 1 cách dễ dàng vui vẻ.

📜 License

Sử dụng cho mục đích học tập.

📌 Link check

https://watanabe-mei.github.io/game_tieng_nhat/
