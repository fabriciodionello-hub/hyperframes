#!/usr/bin/env bash
# Runs a node tool with Chrome on Mesa llvmpipe (software OpenGL, ~4x faster than SwiftShader here).
exec xvfb-run -a -s "-screen 0 1280x2200x24" env GLMODE=llvmpipe LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe LP_NUM_THREADS="${LP_NUM_THREADS:-4}" node "$@"
