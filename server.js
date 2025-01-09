const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const marked = require('marked');
const matter = require('gray-matter');

const app = express();
const port = 3000;

// Cache for partials
const partialsCache = new Map();

// Helper function to read and cache partials
async function getPartial(name) {
    if (partialsCache.has(name)) {
        return partialsCache.get(name);
    }
    try {
        const content = await fs.readFile(`./templates/partials/${name}.html`, 'utf-8');
        partialsCache.set(name, content);
        return content;
    } catch (err) {
        console.error(`Error reading partial ${name}:`, err);
        return '';
    }
}

// Helper function to inject partials
async function injectPartials(template, processedPartials = new Set()) {
    try {
        let processedTemplate = template;
        // Get all partial placeholders using regex
        const partialMatches = template.match(/{{>\s*([^}]+)}}/g) || [];
        
        // Replace each partial placeholder with its content
        for (const match of partialMatches) {
            const partialName = match.match(/{{>\s*([^}]+)}}/)[1].trim();
            
            // Skip if we've already processed this partial to prevent recursion
            if (processedPartials.has(partialName)) {
                continue;
            }
            
            // Mark this partial as processed
            processedPartials.add(partialName);
            
            // Get and process the partial content
            const partialContent = await getPartial(partialName);
            
            // Process any nested partials in the partial content first
            const processedContent = await injectPartials(partialContent, processedPartials);
            
            // Replace all occurrences of this partial
            processedTemplate = processedTemplate.replaceAll(match, processedContent);
        }
        
        return processedTemplate;
    } catch (err) {
        console.error('Error injecting partials:', err);
        return template;
    }
}

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
        const template = await fs.readFile(`./templates/${templateName}.html`, 'utf-8');
        return await injectPartials(template);
    } catch (err) {
        console.error(`Error reading template ${templateName}:`, err);
        return null;
    }
}

// Home page route
app.get('/', async (req, res) => {
    try {
        const template = await readTemplate('base');
        
        // Read and process the markdown file
        const content = await readMarkdownFile('./content/pages/home.md');
        if (!content) {
            res.status(500).send('Home page content not found');
            return;
        }

        // Get latest posts
        const files = await fs.readdir('./content/posts');
        const posts = await Promise.all(
            files
                .filter(file => file.endsWith('.md'))
                .map(file => readMarkdownFile(`./content/posts/${file}`))
        );

        // Sort posts by date, newest first
        posts.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Create the posts HTML
        const postsHtml = posts.map(post => `
            <li><a href="/blog/${post.slug}">${post.title}</a></li>
        `).join('');

        // Replace posts placeholder in the HTML content
        const processedContent = content.content.replace('{{posts}}', postsHtml);

        // Replace content in base template
        const html = template.replace('{{content}}', processedContent);
        
        res.send(html);
    } catch (err) {
        console.error('Error in home page:', err);
        res.status(500).send('Server error');
    }
});

// Blog index route (must come before the catch-all route)
app.get('/blog', async (req, res, next) => {
    try {
        let template = await readTemplate('blog-list');
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
            let postHtml = loop;
            Object.entries(post).forEach(([key, value]) => {
                postHtml = postHtml.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
            });
            return postHtml;
        }).join('');

        // Combine all parts and replace any remaining template variables
        const html = beforeLoop + postsHtml + afterLoop;
        res.send(html);
    } catch (err) {
        console.error('Error in blog index:', err);
        res.status(500).send('Server error');
    }
});

// Individual blog post route (must come before the catch-all route)
app.get('/blog/:slug', async (req, res, next) => {
    try {
        const post = await readMarkdownFile(`./content/posts/${req.params.slug}.md`);
        if (!post) {
            return next();
        }

        let template = await readTemplate(post.template || 'blog');
        if (!template) {
            res.status(500).send('Template error');
            return;
        }

        // Replace all post variables in the template
        Object.entries(post).forEach(([key, value]) => {
            template = template.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
        });

        // Handle conditional blocks
        template = template.replace(/{{#if author}}(.*?){{\/if}}/gs, (match, content) => {
            return post.author ? content.replace('{{author}}', post.author) : '';
        });

        res.send(template);
    } catch (err) {
        next(err);
    }
});

// About page route
app.get('/about', async (req, res) => {
    try {
        const template = await readTemplate('base');
        const content = await readMarkdownFile('./content/pages/about.md');
        
        if (!content) {
            return next();
        }
        
        const html = template.replace('{{content}}', content.content);
        res.send(html);
    } catch (err) {
        res.status(500).send('Server error');
    }
});

// FAQ page route
app.get('/faq', async (req, res) => {
    try {
        const template = await readTemplate('base');
        const content = await readMarkdownFile('./content/pages/faq.md');
        
        if (!content) {
            return next();
        }
        
        const html = template.replace('{{content}}', content.content);
        res.send(html);
    } catch (err) {
        res.status(500).send('Server error');
    }
});

// Serve static files (moved after routes)
app.use(express.static('public'));

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 