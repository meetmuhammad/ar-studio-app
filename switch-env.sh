#!/bin/bash

# Script to switch between production and ledger environments
# Usage: ./switch-env.sh [production|ledger]

ENV_TYPE=$1

if [ -z "$ENV_TYPE" ]; then
  echo "Usage: ./switch-env.sh [production|ledger]"
  echo ""
  echo "Current environment:"
  if [ -f .env ]; then
    if grep -q "YOUR-LEDGER-PROJECT" .env 2>/dev/null; then
      echo "  → Ledger (Development)"
    else
      echo "  → Production"
    fi
  else
    echo "  → No .env file found"
  fi
  exit 1
fi

case $ENV_TYPE in
  production)
    if [ ! -f .env.production ]; then
      echo "Error: .env.production not found!"
      echo "Creating backup of current .env as .env.production..."
      cp .env .env.production
    fi
    cp .env.production .env
    echo "✓ Switched to PRODUCTION environment"
    echo "  Database: Production Supabase"
    ;;
  ledger)
    if [ ! -f .env.ledger ]; then
      echo "Error: .env.ledger not found!"
      echo ""
      if [ -f .env.ledger.template ]; then
        echo "To create .env.ledger:"
        echo "  1. Copy the template: cp .env.ledger.template .env.ledger"
        echo "  2. Edit .env.ledger with your dummy Supabase credentials"
        echo "  3. Run this script again"
      else
        echo "Please create .env.ledger with your dummy database credentials"
      fi
      exit 1
    fi
    cp .env.ledger .env
    echo "✓ Switched to LEDGER environment"
    echo "  Database: Ledger Development Supabase"
    ;;
  *)
    echo "Error: Invalid environment type '$ENV_TYPE'"
    echo "Usage: ./switch-env.sh [production|ledger]"
    exit 1
    ;;
esac

echo ""
echo "Note: Restart your development server for changes to take effect"
