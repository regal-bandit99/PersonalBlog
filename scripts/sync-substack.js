require('dotenv').config();
const Parser = require('rss-parser');
const { convert } = require('html-to-markdown');
const fs = require('fs').promises;
const path = require('path');

const SUBSTACK_URL = 'https://jarednations.substack.com';
const POSTS_DIR = path.join(__dirname, '../content/posts');
const parser = new Parser();

async function fetchSubstackPosts() {
    try {
        const feed = await parser.parseURL(`${SUBSTACK_URL}/feed`);
        return feed.items.map(item => ({
            title: item.title,
            content: item.content,
            date: new Date(item.pubDate).toISOString().split('T')[0],
            url: item.link
        }));
    } catch (error) {
        console.error('Error fetching Substack posts:', error);
        return [];
    }
}

async function convertToMarkdown(post) {
    // Convert HTML content to Markdown
    const markdown = `---
title: ${post.title}
date: ${post.date}
author: Jared Nations
template: blog
original_url: ${post.url}
---

${convert(post.content)}`;
    return markdown;
}

async function savePost(post) {
    const markdown = await convertToMarkdown(post);
    const slug = post.title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const filePath = path.join(POSTS_DIR, `${slug}.md`);
    
    // Check if post already exists
    try {
        const existing = await fs.readFile(filePath, 'utf-8');
        if (existing) {
            console.log(`Post already exists: ${post.title}`);
            return;
        }
    } catch (error) {
        // File doesn't exist, proceed with saving
    }
    
    await fs.writeFile(filePath, markdown, 'utf-8');
    console.log(`Saved post: ${post.title}`);
}

async function syncPosts() {
    try {
        const posts = await fetchSubstackPosts();
        
        // Create posts directory if it doesn't exist
        await fs.mkdir(POSTS_DIR, { recursive: true });
        
        // Save each post
        for (const post of posts) {
            await savePost(post);
        }
        
        console.log('Sync completed successfully!');
    } catch (error) {
        console.error('Error syncing posts:', error);
    }
}

// Run the sync
syncPosts(); 