.PHONY: help install test dev parser clean smoke watch export-graphml export-cypher ui-review ui-console ui-console-dev ui-home ui-notes metrics snapshot snapshots rollback server-graphql launcher

help:
	@echo "ARES Build Commands"
	@echo "  make install         - Install Node + Python dependencies"
	@echo "  make parser          - Start spaCy parser service (port 8000)"
	@echo "  make server-graphql  - Start GraphQL server (port 4000, metrics 4100)"
	@echo "  make dev             - Start GraphQL API server (port 4000)"
	@echo "  make ui-review       - Start review dashboard (port 3000)"
	@echo "  make ui-console      - Start GraphQL server for Sprint R4/R5/R6/R7 API access"
	@echo "  make ui-console-dev  - Start Sprint R5/R6/R7 Console UI (port 3001)"
	@echo "  make ui-home         - Open Home page (prompt-first interface)"
	@echo "  make ui-notes        - Open Notes page (Markdown editor)"
	@echo "  make launcher        - Create desktop launcher app (macOS)"
	@echo "  make test            - Run all tests"
	@echo "  make smoke           - Quick smoke test (requires parser running)"
	@echo "  make watch           - Watch directory for new documents (PROJECT=default DIR=./incoming)"
	@echo "  make export-graphml  - Export graph to GraphML (PROJECT=default OUT=out/graph.graphml)"
	@echo "  make export-cypher   - Export graph to Cypher (PROJECT=default OUT=out/graph.cypher)"
	@echo "  make metrics         - Fetch and display metrics"
	@echo "  make snapshot        - Create snapshot (PROJECT=default)"
	@echo "  make snapshots       - List snapshots (PROJECT=default)"
	@echo "  make rollback        - Rollback to snapshot (PROJECT=default ID=<id>)"
	@echo "  make clean           - Remove generated files"

install:
	@echo "Installing Node dependencies..."
	npm install
	@echo "Setting up Python venv..."
	python3 -m venv .venv --system-site-packages
	@echo "Checking Python dependencies..."
	. .venv/bin/activate && python -c "import importlib.util, sys; required=('fastapi','uvicorn','spacy'); missing=[p for p in required if importlib.util.find_spec(p) is None]; sys.exit(1 if missing else 0)"
	@echo "Ensuring spaCy model is available..."
	. .venv/bin/activate && python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('en_core_web_sm') else 1)" || (. .venv/bin/activate && python -m spacy download en_core_web_sm)
	@echo "Done! Run 'make parser' and 'make dev' to start services."

parser:
	@echo "Starting spaCy parser service on http://127.0.0.1:8000"
	. .venv/bin/activate && cd scripts && uvicorn parser_service:app --host 127.0.0.1 --port 8000

dev:
	@$(MAKE) server-graphql

test:
	@echo "Running tests..."
	npx vitest run --reporter=verbose

test-watch:
	@echo "Running tests in watch mode..."
	npx vitest

smoke:
	@echo "Running smoke test (make sure parser is running first)..."
	npx ts-node tests/smoke.ts

watch:
	@echo "Watching directory for new documents..."
	@echo "Project: $(or $(PROJECT),default)"
	@echo "Directory: $(or $(DIR),./incoming)"
	npx ts-node cli/ares-wiki.ts watch $(or $(PROJECT),default) --dir $(or $(DIR),./incoming)

export-graphml:
	@echo "Exporting graph to GraphML..."
	@echo "Project: $(or $(PROJECT),default)"
	@echo "Output: $(or $(OUT),out/graph.graphml)"
	npx ts-node cli/ares-wiki.ts export $(or $(PROJECT),default) --format graphml --out $(or $(OUT),out/graph.graphml)

export-cypher:
	@echo "Exporting graph to Cypher..."
	@echo "Project: $(or $(PROJECT),default)"
	@echo "Output: $(or $(OUT),out/graph.cypher)"
	npx ts-node cli/ares-wiki.ts export $(or $(PROJECT),default) --format cypher --out $(or $(OUT),out/graph.cypher)

server-graphql:
	@echo "Starting GraphQL server on port 4000..."
	npx ts-node -e "require('./app/api/graphql').startGraphQLServer(4000)"

ui-review:
	@echo "Starting Review Dashboard on port 3000..."
	cd app/ui/review-dashboard && npm install && npm run dev

ui-console:
	@echo "========================================="
	@echo "Sprint R4/R5/R6 GraphQL API Server"
	@echo "========================================="
	@echo ""
	@echo "Starting GraphQL server with Sprint R4/R5/R6 endpoints:"
	@echo "  • listEntities / getEntity"
	@echo "  • listRelations / getRelation"
	@echo "  • graphNeighborhood / graphByPredicate"
	@echo "  • Snapshots & Exports"
	@echo "  • Wiki file serving (/wiki-file)"
	@echo "  • Download endpoint (/download)"
	@echo ""
	@echo "GraphQL Playground: http://localhost:4000"
	@echo "Metrics endpoint:   http://localhost:4100/metrics"
	@echo ""
	@echo "See WIKI_QUICKSTART.md for query examples"
	@echo "========================================="
	@echo ""
	npx ts-node -e "require('./app/api/graphql').startGraphQLServer(4000)"

ui-console-dev:
	@echo "========================================="
	@echo "Sprint R5/R6/R7 ARES Console UI"
	@echo "========================================="
	@echo ""
	@echo "Starting React console with:"
	@echo "  • Interactive entity/relation browser"
	@echo "  • Graph visualization (D3 force layout)"
	@echo "  • Markdown notes with entity tagging"
	@echo "  • Citation seeds management"
	@echo "  • Wiki markdown viewer"
	@echo "  • Snapshot management"
	@echo "  • GraphML/Cypher exports"
	@echo "  • Live metrics dashboard"
	@echo ""
	@echo "Console UI:   http://localhost:3001"
	@echo "GraphQL API:  http://localhost:4000 (start with 'make ui-console')"
	@echo ""
	@echo "NOTE: Requires GraphQL server running in separate terminal!"
	@echo "      Run 'make ui-console' in another terminal first."
	@echo "========================================="
	@echo ""
	cd app/ui/console && npm run dev

ui-home:
	@echo "Opening Home page at http://localhost:3001/home"
	@echo "NOTE: Make sure both servers are running:"
	@echo "  Terminal 1: make ui-console"
	@echo "  Terminal 2: make ui-console-dev"
	@command -v open >/dev/null 2>&1 && open http://localhost:3001/home || echo "Please open http://localhost:3001/home in your browser"

ui-notes:
	@echo "Opening Notes page at http://localhost:3001/notes"
	@echo "NOTE: Make sure both servers are running:"
	@echo "  Terminal 1: make ui-console"
	@echo "  Terminal 2: make ui-console-dev"
	@command -v open >/dev/null 2>&1 && open http://localhost:3001/notes || echo "Please open http://localhost:3001/notes in your browser"

metrics:
	@echo "Fetching metrics from port 4100..."
	curl -s http://localhost:4100/metrics | head -n 50

snapshot:
	@echo "Creating snapshot for project: $(or $(PROJECT),default)"
	npx ts-node cli/ares-wiki.ts snapshot $(or $(PROJECT),default)

snapshots:
	@echo "Listing snapshots for project: $(or $(PROJECT),default)"
	npx ts-node cli/ares-wiki.ts snapshots $(or $(PROJECT),default)

rollback:
	@echo "Rolling back project $(or $(PROJECT),default) to snapshot $(ID)"
	npx ts-node cli/ares-wiki.ts rollback $(or $(PROJECT),default) $(ID)

launcher:
	@echo "Creating desktop launcher..."
	./scripts/create-launcher.sh

clean:
	rm -rf node_modules .venv data/processed/* data/graph/*
	find . -name "*.pyc" -delete
	find . -name "__pycache__" -delete
