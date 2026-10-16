@echo off
cd /d C:\Users\Administrator\Desktop\MS.WOOD

echo ===== Git Status =====
git status --short

echo ===== Adding all files =====
git add -A

echo ===== Status after add =====
git status --short

echo ===== Committing =====
git commit -m "تأمين قسم العاملين بتسجيل دخول منفصل للمالك وتوثيق كامل لجميع ملفات الكود"

echo ===== Pushing to GitHub =====
git push origin main

echo ===== Done =====
pause