#!/bin/bash
# Script khởi chạy CapCut Mini Video Editor cục bộ

PORT=8080
echo "🚀 Đang khởi động CapCut Mini tại http://localhost:$PORT ..."

# Kiểm tra xem cổng 8080 có bị chiếm không
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    PORT=8081
fi

# Mở trình duyệt Chrome hoặc trình duyệt mặc định trên macOS
open -a "Google Chrome" "http://localhost:$PORT" 2>/dev/null || open "http://localhost:$PORT"

# Khởi chạy máy chủ HTTP siêu nhẹ bằng Python có sẵn trên Mac
/usr/bin/python3 -m http.server $PORT
