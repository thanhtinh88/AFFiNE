#!/bin/bash
set -e

# Auto-detect project root và cd vào đó
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "================================"
echo "🚀 Building AFFiNE Docker Image"
echo "================================"
echo "Script location: $SCRIPT_DIR"
echo "Project root: $PROJECT_ROOT"
echo ""

# Di chuyển về project root
cd "$PROJECT_ROOT"
echo "✅ Changed to project root: $(pwd)"
echo ""

# Bước 1: Clean
echo "🧹 Step 1: Cleaning old builds..."
rm -rf packages/frontend/apps/web/dist
rm -rf packages/frontend/admin/dist
rm -rf packages/frontend/apps/mobile/dist
rm -rf packages/backend/server/dist

# Bước 2: Install dependencies
echo ""
echo "📦 Step 2: Installing dependencies..."
yarn install

# Bước 3: Build web
echo ""
echo "🔨 Step 3: Building @affine/web..."
yarn affine @affine/web build
echo "✅ Web built → packages/frontend/apps/web/dist/"

# Bước 4: Build admin
echo ""
echo "🔨 Step 4: Building @affine/admin..."
yarn affine @affine/admin build
echo "✅ Admin built → packages/frontend/admin/dist/"

# Bước 5: Build mobile
echo ""
echo "📱 Step 5: Building @affine/mobile..."
yarn affine @affine/mobile build
echo "✅ Mobile built → packages/frontend/apps/mobile/dist/"

# Bước 6: Build server-native
echo ""
echo "🦀 Step 6: Building @affine/server-native (Rust)..."
yarn workspace @affine/server-native build

# Build reader
echo ""
echo "🔨 Step X: Building @affine/reader..."
yarn workspace @affine/reader build
echo "✅ Reader built → packages/backend/reader/dist/"

# FIND: Tìm file .node
echo ""
echo "📊 [LOG] Searching for .node files..."
NODE_FILES=$(find . -name "*.node" -type f 2>/dev/null | grep -v node_modules || true)

if [ -z "$NODE_FILES" ]; then
  echo "  ❌ No .node files found!"
  exit 1
else
  echo "  ✅ Found .node files:"
  echo "$NODE_FILES" | while read file; do
    echo "    - $file"
  done
fi

# Tìm server-native.node
echo ""
echo "📊 [LOG] Looking for server-native output..."
NATIVE_FILE=$(find packages/backend -name "*.node" -type f 2>/dev/null | grep -E "(server-native|index)" | head -1 || true)

if [ -z "$NATIVE_FILE" ]; then
  echo "  ❌ ERROR: Native module not found!"
  exit 1
fi

echo "  ✅ Found native file: $NATIVE_FILE"

# Tạo thư mục packages/backend/native nếu chưa có
mkdir -p packages/backend/native

# FIX: Chỉ copy nếu chưa tồn tại hoặc khác file nguồn
echo ""
echo "📊 [LOG] Creating architecture-specific variants..."

# Copy server-native.node nếu chưa có
if [ ! -f "packages/backend/native/server-native.node" ]; then
  cp "$NATIVE_FILE" packages/backend/native/server-native.node
fi

# Tạo các variant (x64, arm64, armv7)
cp packages/backend/native/server-native.node packages/backend/native/server-native.x64.node
cp packages/backend/native/server-native.node packages/backend/native/server-native.arm64.node
cp packages/backend/native/server-native.node packages/backend/native/server-native.armv7.node

echo "  ✅ Created all .node variants:"
ls -lh packages/backend/native/*.node

echo "✅ Server-native built"

# Bước 7: Build server
echo ""
echo "🔨 Step 7: Building @affine/server..."
yarn workspace @affine/server build
echo "✅ Server built → packages/backend/server/dist/"

# Bước 8: Chuẩn bị node_modules cho Docker
echo ""
echo "📋 Step 8: Preparing production dependencies..."

# LOG: Check BEFORE cleanup
echo ""
echo "📊 [LOG] Status BEFORE cleanup:"
echo "  - Root node_modules: $([ -d './node_modules' ] && echo 'EXISTS' || echo 'NOT FOUND')"
echo "  - Server node_modules: $([ -d './packages/backend/server/node_modules' ] && echo 'EXISTS' || echo 'NOT FOUND')"

# Backup root node_modules (nếu có)
if [ -d "./node_modules" ]; then
  echo "  → Backing up root node_modules..."
  mv ./node_modules ./node_modules.backup
fi

# Clean server node_modules
echo "  → Cleaning server node_modules..."
rm -rf packages/backend/server/node_modules

# Config yarn architecture
echo "  → Configuring yarn architecture..."
yarn config set --json supportedArchitectures.cpu '["x64"]'
yarn config set --json supportedArchitectures.libc '["glibc"]'

# Install production deps
echo "  → Installing production dependencies..."
yarn workspaces focus @affine/server --production

# LOG: Check AFTER install
echo ""
echo "📊 [LOG] Status AFTER yarn install:"
echo "  - Root node_modules: $([ -d './node_modules' ] && echo 'EXISTS' || echo 'NOT FOUND')"
echo "  - Server node_modules: $([ -d './packages/backend/server/node_modules' ] && echo 'EXISTS' || echo 'NOT FOUND')"

if [ -d './packages/backend/server/node_modules' ]; then
  echo "  - Server node_modules size: $(du -sh ./packages/backend/server/node_modules 2>/dev/null | cut -f1 || echo 'N/A')"
fi

if [ -d './node_modules' ]; then
  echo "  - Root node_modules size: $(du -sh ./node_modules 2>/dev/null | cut -f1 || echo 'N/A')"
fi

# Generate Prisma client
echo ""
echo "  → Generating Prisma client..."
yarn workspace @affine/server prisma generate

# Move node_modules
echo ""
echo "  → Handling node_modules location..."
if [ -d "./packages/backend/server/node_modules" ]; then
  echo "  ✅ node_modules already in server package (no need to move)"
elif [ -d "./node_modules" ]; then
  echo "  → Moving from root to server..."
  mv ./node_modules ./packages/backend/server/
  echo "  ✅ Moved node_modules to packages/backend/server/"
else
  echo "  ❌ ERROR: node_modules not found anywhere!"
  exit 1
fi

# Restore backup
if [ -d "./node_modules.backup" ]; then
  echo "  → Restoring node_modules backup..."
  mv ./node_modules.backup ./node_modules
fi

# LOG: Final check
echo ""
echo "📊 [LOG] FINAL Status:"
echo "  - Root node_modules: $([ -d './node_modules' ] && echo 'EXISTS' || echo 'NOT FOUND')"
echo "  - Server node_modules: $([ -d './packages/backend/server/node_modules' ] && echo 'EXISTS' || echo 'NOT FOUND')"
if [ -d './packages/backend/server/node_modules' ]; then
  echo "  - Server node_modules contains: $(ls ./packages/backend/server/node_modules 2>/dev/null | wc -l || echo '0') packages"
fi

# Bước 9: Build Docker image
echo ""
echo "🐋 Step 9: Building Docker image..."
docker build \
  -f .github/deployment/node/Dockerfile \
  -t affine:production \
  .

# Bước 10: Verify
echo ""
echo "================================"
echo "✅ Build completed successfully!"
echo "================================"
echo ""
echo "Docker image created:"
docker images | grep affine | grep production

echo ""
echo "Built components:"
echo "  ✓ Web app:    packages/frontend/apps/web/dist/"
echo "  ✓ Admin app:  packages/frontend/admin/dist/"
echo "  ✓ Mobile app: packages/frontend/apps/mobile/dist/"
echo "  ✓ Server:     packages/backend/server/dist/"
echo ""
echo "To run:"
echo "  docker-compose -f docker-compose.prod.yml up -d"