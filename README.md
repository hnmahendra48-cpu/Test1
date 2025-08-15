# Weekly Tasks & Calendar

A simple, local-first webpage to manage weekly tasks and a monthly calendar view. Tasks are saved in your browser (localStorage).

## Run

Open `index.html` directly in your browser, or serve the folder:

- Python 3: `python3 -m http.server 8080` then visit `http://localhost:8080`
- Node: `npx serve -s .` then visit the printed URL

## Features

- Week board (Mon–Sun) with tasks per day
- Add tasks with optional date and priority
- Monthly calendar with tasks shown on dates
- Date panel to review and add tasks for a specific day
- LocalStorage persistence

## Notes

- Days of week are Monday-first. Calendar shows 6 weeks for consistent layout.
- Double-click a task to quick-edit its title.