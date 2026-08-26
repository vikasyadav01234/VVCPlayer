@echo off
title VVC Player
cd /d "%~dp0"
echo Starting VVC Player...
node_modules\.bin\electron.cmd .
