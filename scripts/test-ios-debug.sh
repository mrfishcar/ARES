#!/bin/bash

# iOS Editor Debugging Test Script
# This script helps verify the debugging enhancements are working

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         ARES iOS Editor Debugging - Test Script               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx" ]; then
    echo "❌ Error: Please run this script from the ARES project root"
    exit 1
fi

echo "✅ Found ARES project structure"
echo ""

# Check if the enhanced ScrollIntoViewPlugin exists
if grep -q "window.ARES_DEBUG_SCROLL" app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx; then
    echo "✅ ScrollIntoViewPlugin has debug flag support"
else
    echo "❌ ScrollIntoViewPlugin missing debug flag"
    exit 1
fi

# Check for debug logging functions
if grep -q "debugLog\|debugWarn\|debugError" app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx; then
    echo "✅ Debug logging functions present"
else
    echo "❌ Debug logging functions missing"
    exit 1
fi

# Check for toolbar overlap detection
if grep -q "toolbarScrollLeakage\|toolbar.*overlapping" app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx; then
    echo "✅ Toolbar overlap detection implemented"
else
    echo "⚠️  Warning: Toolbar overlap detection may be missing"
fi

# Check for caret tracking
if grep -q "caretStatus\|Behind keyboard\|Behind toolbar" app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx; then
    echo "✅ Caret visibility tracking implemented"
else
    echo "⚠️  Warning: Caret tracking may be incomplete"
fi

# Check for scroll verification
if grep -q "scrollSuccess\|actualScroll" app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx; then
    echo "✅ Scroll verification implemented"
else
    echo "⚠️  Warning: Scroll verification may be missing"
fi

# Check for timestamp support
if grep -q "toISOString\|performance.now" app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx; then
    echo "✅ Timestamp logging enabled"
else
    echo "⚠️  Warning: Timestamps may not be present"
fi

# Check for documentation
echo ""
echo "Checking documentation..."
if [ -f "docs/iOS-EDITOR-DEBUGGING.md" ]; then
    echo "✅ Full documentation exists (iOS-EDITOR-DEBUGGING.md)"
else
    echo "⚠️  Warning: Full documentation not found"
fi

if [ -f "docs/iOS-EDITOR-DEBUGGING-QUICK.md" ]; then
    echo "✅ Quick reference exists (iOS-EDITOR-DEBUGGING-QUICK.md)"
else
    echo "⚠️  Warning: Quick reference not found"
fi

if [ -f "app/ui/console/debug-demo.html" ]; then
    echo "✅ Debug demo page exists"
else
    echo "⚠️  Warning: Debug demo page not found"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                      Test Summary                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Count lines of logging code
DEBUG_LINES=$(grep -c "debugLog\|debugWarn\|debugError" app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx)
echo "📊 Debug log statements: $DEBUG_LINES"

# Count log event types
CARET_LOGS=$(grep -c "🎯.*Caret" app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx)
SCROLL_LOGS=$(grep -c "🔽.*Scrolling\|🔼.*Scrolling" app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx)
VIEWPORT_LOGS=$(grep -c "⌨️.*Viewport" app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx)

echo "   - Caret tracking logs: $CARET_LOGS"
echo "   - Scroll operation logs: $SCROLL_LOGS"
echo "   - Viewport change logs: $VIEWPORT_LOGS"

echo ""
echo "🎉 Enhancement verification complete!"
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Next Steps                                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "1. Start the dev server:"
echo "   cd app/ui/console && npm run dev"
echo ""
echo "2. Open browser console and run:"
echo "   window.ARES_DEBUG_SCROLL = true"
echo ""
echo "3. Reload the page and start typing"
echo ""
echo "4. Look for logs starting with:"
echo "   [ScrollPlugin HH:MM:SS.mmm]"
echo ""
echo "5. For detailed guide, see:"
echo "   docs/iOS-EDITOR-DEBUGGING-QUICK.md"
echo ""
echo "6. For iOS device debugging:"
echo "   - Connect iPhone/iPad to Mac via USB"
echo "   - Safari → Develop → [Device] → [Tab]"
echo "   - Run: window.ARES_DEBUG_SCROLL = true"
echo ""
