const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const marked = require('marked');

const app = express();
const port = 3000;

// Serve static files
app.use(express.static('public'));

// Helper function to read markdown files
async function readMarkdownFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return marked.parse(content);
    } catch (err) {
        console.error(`Error reading file ${filePath}:`, err);
        return null;
    }
}

// Basic route for homepage
app.get('/', async (req, res) => {
    try {
        const template = await fs.readFile('./templates/base.html', 'utf-8');
        const content = await readMarkdownFile('./content/pages/home.md');
        const html = template.replace('{{content}}', content || '<h1>Welcome to my blog!</h1>');
        res.send(html);
    } catch (err) {
        res.status(500).send('Error loading page');
    }
});

// Route for other pages (About, FAQ)
app.get('/:page', async (req, res) => {
    const page = req.params.page;
    try {
        const template = await fs.readFile('./templates/base.html', 'utf-8');
        const content = await readMarkdownFile(`./content/pages/${page}.md`);
        
        if (!content) {
            res.status(404).send('Page not found');
            return;
        }
        
        const html = template.replace('{{content}}', content);
        res.send(html);
    } catch (err) {
        res.status(500).send('Error loading page');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 