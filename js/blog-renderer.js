// Blog Renderer - Handles loading and rendering markdown blog posts

/**
 * Loads blog list from JSON and renders cards on the blogs page
 */
async function loadBlogList() {
    try {
        const response = await fetch('blogs/blog-posts.json');
        const posts = await response.json();

        const blogListElement = document.getElementById('blog-list');

        if (posts.length === 0) {
            blogListElement.innerHTML = '<p class="no-posts">No blog posts yet. Check back soon!</p>';
            return;
        }

        // Sort posts by date (newest first)
        posts.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Generate blog cards
        const blogCards = posts.map(post => {
            const formattedDate = formatDate(post.date);
            const tagsHTML = post.tags.map(tag => `<span class="tag">${tag}</span>`).join('');

            return `
                <div class="blog-card fade-in">
                    <div class="blog-card-content">
                        <div class="blog-card-header">
                            <h2 class="blog-card-title">${post.title}</h2>
                            <div class="blog-card-meta">
                                <span class="date">${formattedDate}</span>
                                <span class="separator">•</span>
                                <span class="read-time">${post.readTime}</span>
                            </div>
                        </div>
                        <p class="blog-card-description">${post.description}</p>
                        <div class="blog-card-footer">
                            <div class="tags">${tagsHTML}</div>
                            <a href="blog-post.html?slug=${post.slug}" class="read-more">
                                Read More →
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        blogListElement.innerHTML = blogCards;

        // Add fade-in animation
        setTimeout(() => {
            document.querySelectorAll('.blog-card').forEach((card, index) => {
                setTimeout(() => {
                    card.classList.add('visible');
                }, index * 100);
            });
        }, 100);

    } catch (error) {
        console.error('Error loading blog posts:', error);
        document.getElementById('blog-list').innerHTML =
            '<p class="error">Failed to load blog posts. Please try again later.</p>';
    }
}

/**
 * Loads and renders individual blog post from markdown file
 */
async function loadBlogPost() {
    try {
        // Get slug from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const slug = urlParams.get('slug');

        if (!slug) {
            showError('Blog post not found');
            return;
        }

        // Load metadata
        const metadataResponse = await fetch('blogs/blog-posts.json');
        const posts = await metadataResponse.json();
        const postMeta = posts.find(p => p.slug === slug);

        if (!postMeta) {
            showError('Blog post not found');
            return;
        }

        // Load markdown content
        const markdownResponse = await fetch(`blogs/posts/${slug}.md`);
        if (!markdownResponse.ok) {
            throw new Error('Markdown file not found');
        }
        const markdownContent = await markdownResponse.text();

        // Parse frontmatter (if exists) and content
        const { frontmatter, content } = parseFrontmatter(markdownContent);

        // Merge frontmatter with metadata (frontmatter takes precedence)
        const finalMeta = { ...postMeta, ...frontmatter };

        // Update page metadata
        updatePageMetadata(finalMeta);

        // Add canonical tag if URL exists
        if (finalMeta.canonical && finalMeta.canonical.trim() !== '') {
            addCanonicalTag(finalMeta.canonical);
            showCanonicalNotice(finalMeta.canonical);
        }

        // Render post header
        renderPostHeader(finalMeta);

        // Convert markdown to HTML and render
        renderMarkdownContent(content);

    } catch (error) {
        console.error('Error loading blog post:', error);
        showError('Failed to load blog post. Please try again later.');
    }
}

/**
 * Parses frontmatter from markdown content
 */
function parseFrontmatter(markdown) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = markdown.match(frontmatterRegex);

    if (!match) {
        return { frontmatter: {}, content: markdown };
    }

    const frontmatterText = match[1];
    const content = match[2];

    // Parse YAML-like frontmatter
    const frontmatter = {};
    frontmatterText.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            let value = line.substring(colonIndex + 1).trim();

            // Remove quotes if present
            value = value.replace(/^["']|["']$/g, '');

            // Parse arrays
            if (value.startsWith('[') && value.endsWith(']')) {
                value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
            }

            frontmatter[key] = value;
        }
    });

    return { frontmatter, content };
}

/**
 * Updates page title and meta description
 */
function updatePageMetadata(meta) {
    document.getElementById('page-title').textContent = `${meta.title} - Aftab Muddassir`;
    document.getElementById('meta-description').setAttribute('content', meta.description);
}

/**
 * Adds canonical link tag to page head
 */
function addCanonicalTag(canonicalUrl) {
    // Remove existing canonical tag if present
    const existingCanonical = document.querySelector('link[rel="canonical"]');
    if (existingCanonical) {
        existingCanonical.remove();
    }

    // Add new canonical tag
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.href = canonicalUrl;
    document.head.appendChild(link);
}

/**
 * Shows canonical notice on the page
 */
function showCanonicalNotice(canonicalUrl) {
    const notice = document.getElementById('canonical-notice');
    const link = document.getElementById('canonical-link');

    if (notice && link) {
        link.href = canonicalUrl;
        link.textContent = getDomainName(canonicalUrl);
        notice.style.display = 'block';
    }
}

/**
 * Extracts domain name from URL
 */
function getDomainName(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch {
        return url;
    }
}

/**
 * Renders post header with metadata
 */
function renderPostHeader(meta) {
    document.getElementById('post-title').textContent = meta.title;
    document.getElementById('post-date').textContent = formatDate(meta.date);
    document.getElementById('post-read-time').textContent = meta.readTime;

    // Render tags
    const tagsElement = document.getElementById('post-tags');
    if (meta.tags && meta.tags.length > 0) {
        const tagsHTML = meta.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
        tagsElement.innerHTML = tagsHTML;
    }
}

/**
 * Renders markdown content to HTML with syntax highlighting
 */
function renderMarkdownContent(markdown) {
    // Configure marked
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (err) {
                    console.error('Highlight error:', err);
                }
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true
    });

    // Convert markdown to HTML
    const htmlContent = marked.parse(markdown);

    // Render to page
    document.getElementById('post-content').innerHTML = htmlContent;

    // Apply syntax highlighting to any missed code blocks
    document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });
}

/**
 * Shows error message
 */
function showError(message) {
    const contentElement = document.getElementById('post-content') || document.getElementById('blog-list');
    if (contentElement) {
        contentElement.innerHTML = `
            <div class="error-container">
                <p class="error">${message}</p>
                <a href="blogs.html" class="btn-back">← Back to Blog</a>
            </div>
        `;
    }
}

/**
 * Formats date string to readable format
 */
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}
