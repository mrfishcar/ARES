"use strict";
/**
 * Meaning Layer Integration Test
 *
 * Demonstrates the new meaning layer extracting clean intermediate representations
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var orchestrator_1 = require("./app/engine/extract/orchestrator");
var meaning_test_utils_1 = require("./app/engine/meaning-test-utils");
function testMeaningLayer() {
    return __awaiter(this, void 0, void 0, function () {
        var testText, docId, result;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log('\n=== Meaning Layer Integration Test ===\n');
                    testText = "Frederick ruled Gondor wisely. Aragorn traveled to Rivendell.";
                    docId = "test-meaning-layer";
                    console.log("Input: \"".concat(testText, "\"\n"));
                    return [4 /*yield*/, (0, orchestrator_1.extractFromSegments)(docId, testText)];
                case 1:
                    result = _c.sent();
                    console.log("\u2705 Extracted:");
                    console.log("   - ".concat(result.entities.length, " entities"));
                    console.log("   - ".concat(result.relations.length, " relations"));
                    console.log("   - ".concat(result.meaningRecords.length, " meaning records\n"));
                    // Show entities
                    console.log('Entities:');
                    result.entities.forEach(function (e, i) {
                        console.log("  ".concat(i + 1, ". ").concat(e.canonical, " (").concat(e.type, ")"));
                    });
                    // Show meaning records (clean representation)
                    console.log('\nMeaning Records:');
                    result.meaningRecords.forEach(function (m, i) {
                        var subj = result.entities.find(function (e) { return e.id === m.subjectId; });
                        var obj = m.objectId ? result.entities.find(function (e) { return e.id === m.objectId; }) : null;
                        console.log("  ".concat(i + 1, ". ").concat((subj === null || subj === void 0 ? void 0 : subj.canonical) || m.subjectId, " \u2192 ").concat(m.relation, " \u2192 ").concat((obj === null || obj === void 0 ? void 0 : obj.canonical) || m.objectId || '(none)'));
                        if (m.qualifiers) {
                            if (m.qualifiers.time)
                                console.log("      time: ".concat(m.qualifiers.time));
                            if (m.qualifiers.place)
                                console.log("      place: ".concat(m.qualifiers.place));
                            if (m.qualifiers.manner)
                                console.log("      manner: ".concat(m.qualifiers.manner));
                        }
                    });
                    // Test expectations
                    console.log('\n=== Testing Expectations ===\n');
                    try {
                        // Test: Should have entities
                        (0, meaning_test_utils_1.expectMeaning)(result.meaningRecords).toHaveLength(2);
                        console.log('✅ Correct number of meaning records');
                        // Test: Frederick rules Gondor
                        (0, meaning_test_utils_1.expectMeaning)(result.meaningRecords).toContain({
                            subj: (_a = result.entities.find(function (e) { return e.canonical === 'Frederick'; })) === null || _a === void 0 ? void 0 : _a.id,
                            rel: 'rules'
                        });
                        console.log('✅ Found: Frederick → rules');
                        // Test: Aragorn traveled_to Rivendell
                        (0, meaning_test_utils_1.expectMeaning)(result.meaningRecords).toContain({
                            subj: (_b = result.entities.find(function (e) { return e.canonical === 'Aragorn'; })) === null || _b === void 0 ? void 0 : _b.id,
                            rel: 'traveled_to'
                        });
                        console.log('✅ Found: Aragorn → traveled_to');
                        console.log('\n✅ All tests passed!\n');
                    }
                    catch (error) {
                        console.error('\n❌ Test failed:', error.message);
                        process.exit(1);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// Run test
testMeaningLayer().catch(function (error) {
    console.error('Test error:', error);
    process.exit(1);
});
