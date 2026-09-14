(function () {
  "use strict";

  const input = document.getElementById("docs-search");
  const results = document.getElementById("search-results");
  const status = document.getElementById("search-status");
  const list = document.getElementById("search-result-list");
  const baseurl = (window.envsyncSite && window.envsyncSite.baseurl) || "";

  if (!input || !results || !status || !list) return;

  let documents;
  let loadPromise;

  function normalise(value) {
    return value
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function loadDocuments() {
    if (documents) return Promise.resolve(documents);
    if (!loadPromise) {
      loadPromise = fetch(baseurl + "/search.json")
        .then(function (response) {
          if (!response.ok) throw new Error("Search index could not be loaded");
          return response.json();
        })
        .then(function (data) {
          documents = data;
          return data;
        });
    }
    return loadPromise;
  }

  function showResults(query, matches) {
    list.replaceChildren();
    results.hidden = false;

    if (!matches.length) {
      status.textContent = 'No pages match "' + query + '".';
      return;
    }

    status.textContent = matches.length + (matches.length === 1 ? " page" : " pages") + " found.";
    matches.slice(0, 8).forEach(function (match) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const title = document.createElement("span");
      const description = document.createElement("span");

      link.href = match.url;
      title.className = "search-results__title";
      title.textContent = match.title;
      description.className = "search-results__description";
      description.textContent = match.description || "Open this documentation page";
      link.append(title, description);
      item.append(link);
      list.append(item);
    });
  }

  function search(query) {
    const terms = normalise(query).split(/\s+/).filter(Boolean);
    const matches = documents
      .map(function (document) {
        const title = normalise(document.title || "");
        const description = normalise(document.description || "");
        const content = normalise(document.content || "");
        let score = 0;

        for (const term of terms) {
          if (!title.includes(term) && !description.includes(term) && !content.includes(term)) return null;
          if (title.includes(term)) score += title === term ? 40 : 20;
          if (description.includes(term)) score += 8;
          if (content.includes(term)) score += 1;
        }

        return { document: document, score: score };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.score - a.score || a.document.title.localeCompare(b.document.title);
      })
      .map(function (match) {
        return match.document;
      });

    showResults(query, matches);
  }

  input.addEventListener("input", function () {
    const query = input.value.trim();
    if (query.length < 2) {
      results.hidden = true;
      list.replaceChildren();
      return;
    }

    status.textContent = "Searching...";
    results.hidden = false;
    loadDocuments()
      .then(function () {
        search(query);
      })
      .catch(function () {
        status.textContent = "Search is not available right now.";
        list.replaceChildren();
      });
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      input.value = "";
      results.hidden = true;
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "/" && document.activeElement !== input && document.activeElement.tagName !== "TEXTAREA") {
      event.preventDefault();
      input.focus();
    }
  });
})();
