const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const marked = require('marked');
const matter = require('gray-matter');

const app = express();
const port = 3000;

// Serve static files
app.use(express.static('public'));

// Helper function to read markdown files with frontmatter
async function readMarkdownFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const { data, content: markdownContent } = matter(content);
        return {
            ...data,
            content: marked.parse(markdownContent),
            excerpt: markdownContent.split('\n\n')[0], // First paragraph as excerpt
            slug: path.basename(filePath, '.md')
        };
    } catch (err) {
        console.error(`Error reading file ${filePath}:`, err);
        return null;
    }
}

// Helper function to read template files
async function readTemplate(templateName) {
    try {
        return await fs.readFile(`./templates/${templateName}.html`, 'utf-8');
    } catch (err) {
        console.error(`Error reading template ${templateName}:`, err);
        return null;
    }
}

// Blog index route
app.get('/blog', async (req, res) => {
    try {
        const template = await readTemplate('blog-list');
        const files = await fs.readdir('./content/posts');
        const posts = await Promise.all(
            files
                .filter(file => file.endsWith('.md'))
                .map(file => readMarkdownFile(`./content/posts/${file}`))
        );

        // Sort posts by date, newest first
        posts.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Extract the template parts
        const [beforeLoop, loop, afterLoop] = template.split(/{{#each posts}}|{{\/each}}/);
        
        // Generate the HTML for each post
        const postsHtml = posts.map(post => {
            return loop.replace(/{{([^}]+)}}/g, (match, p1) => {
                const prop = p1.trim();
                return post[prop] || '';
            });
        }).join('');

        // Combine all parts
        const html = beforeLoop + postsHtml + afterLoop;

        res.send(html);
    } catch (err) {
        console.error('Error in blog index:', err);
        res.status(500).send('Server error');
    }
});

// Individual blog post route
app.get('/blog/:slug', async (req, res) => {
    try {
        const post = await readMarkdownFile(`./content/posts/${req.params.slug}.md`);
        if (!post) {
            res.status(404).send('Post not found');
            return;
        }

        const template = await readTemplate(post.template || 'blog');
        if (!template) {
            res.status(500).send('Template error');
            return;
        }

        const html = template.replace(/{{([^}]+)}}/g, (match, p1) => {
            return post[p1.trim()] || '';
        });

        res.send(html);
    } catch (err) {
        res.status(404).send('Post not found');
    }
});

// Route for other pages (About, FAQ)
app.get('/:page', async (req, res) => {
    try {
        const template = await readTemplate('base');
        const content = await readMarkdownFile(`./content/pages/${req.params.page}.md`);
        
        if (!content) {
            res.status(404).send('Page not found');
            return;
        }
        
        const html = template.replace('{{content}}', content.content);
        res.send(html);
    } catch (err) {
        res.status(404).send('Page not found');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 