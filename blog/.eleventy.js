const { DateTime } = require('luxon');
const { default: pluginRss } = require('@11ty/eleventy-plugin-rss');
const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.addPlugin(syntaxHighlight);

  eleventyConfig.setDataDeepMerge(true);

  eleventyConfig.addPassthroughCopy({ 'src/css': 'css' });
  eleventyConfig.addPassthroughCopy({ 'src/images': 'images' });
  eleventyConfig.addPassthroughCopy({ 'src/fonts': 'fonts' });

  eleventyConfig.addFilter('excerpt', (postContent) => {
    if (typeof postContent !== 'string') { return ''; }
    const content = postContent.replace(/(<([^>]+)>)/gi, '');
    if (content.length <= 200) { return content; }
    const lastSpace = content.lastIndexOf(' ', 200);
    return content.slice(0, lastSpace > 0 ? lastSpace : 200) + '...';
  });

  eleventyConfig.addFilter('readableDate', (dateObj) => {
    if (!dateObj || !(dateObj instanceof Date)) {
        return ''; 
    }
    try {
        return DateTime.fromJSDate(dateObj, { zone: 'utc' }).toFormat('yyyy-MM-dd');
    } catch (e) {
        console.error(`Error formatting date: ${dateObj}`, e);
        return '';
    }
  });

  eleventyConfig.addFilter('htmlDateString', (dateObj) => {
    if (!dateObj || !(dateObj instanceof Date)) return ''; 
    try {
        return DateTime.fromJSDate(dateObj, { zone: 'utc' }).toFormat('yyyy-LL-dd');
    } catch (e) { return ''; }
  });

  eleventyConfig.addFilter('dateToIso', (dateString) => {
      try {
        return new Date(dateString).toISOString();
      } catch (e) { return ''; }
  });

  eleventyConfig.addFilter('head', (array, n) => {
    if (!Array.isArray(array) || array.length === 0) return [];
    if (n < 0) { return array.slice(n); }
    return array.slice(0, n);
  });

  eleventyConfig.addFilter('pageTags', (tags) => {
    if (!tags) return [];
    const generalTags = ['all', 'nav', 'post', 'posts'];
    return tags.toString().split(',').filter((tag) => !generalTags.includes(tag));
  });

  eleventyConfig.addCollection('tagList', function (collection) {
    let tagSet = new Set();
    collection.getAll().forEach(function (item) {
      if ('tags' in item.data) {
        let tags = item.data.tags;
        if (!Array.isArray(tags)) { tags = [tags]; }
        tags = tags.filter(tag => typeof tag === 'string' && !['all', 'nav', 'post', 'posts'].includes(tag));
        for (const tag of tags) { tagSet.add(tag); }
      }
    });
    return [...tagSet].sort();
  });

  eleventyConfig.addFilter("readingTime", (content) => {
    if (!content) {
      return "0 min read";
    }
    const text = content.replace(/<[^>]*>/g, '');
    const wordsPerMinute = 200;
    const wordCount = text.split(/\s+/).length;
    const minutes = Math.ceil(wordCount / wordsPerMinute);

    if (minutes === 1) {
      return "1 min read";
    }
    return `${minutes} min read`;
  });

  return {
    pathPrefix: '/blog/',
    dir: {
      input: 'src',
      output: '_site',
      includes: 'includes',
      data: 'data',
      layouts: 'layouts'
    },
    templateFormats: ['html', 'njk', 'md'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
};
