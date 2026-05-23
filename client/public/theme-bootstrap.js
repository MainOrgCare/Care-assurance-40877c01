(function () {
  var storageKey = "lewis-theme";
  var themes = ["light", "sunrise", "dark", "midnight", "ocean", "aurora"];
  var darkThemes = ["dark", "midnight", "ocean", "aurora"];
  var themeColors = {
    light: "#f3f6fa",
    sunrise: "#fbf4f1",
    dark: "#101216",
    midnight: "#0e1020",
    ocean: "#0d1b20",
    aurora: "#0f1f1a"
  };

  function includes(list, value) {
    return list.indexOf(value) !== -1;
  }

  function readTheme() {
    try {
      var saved = window.localStorage && window.localStorage.getItem(storageKey);
      return includes(themes, saved) ? saved : "light";
    } catch (error) {
      return "light";
    }
  }

  function applyTheme(target, theme, isDarkTheme) {
    if (!target) return;
    for (var index = 0; index < themes.length; index += 1) {
      target.classList.remove("theme-" + themes[index]);
    }
    target.classList.remove("dark");
    target.classList.add("theme-" + theme);
    if (isDarkTheme) target.classList.add("dark");
    target.setAttribute("data-theme", theme);
    if (isDarkTheme) {
      target.setAttribute("data-theme-dark", "true");
    } else {
      target.removeAttribute("data-theme-dark");
    }
    target.style.colorScheme = isDarkTheme ? "dark" : "light";
  }

  function updateThemeColor(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", themeColors[theme] || themeColors.light);
  }

  var theme = readTheme();
  var isDarkTheme = includes(darkThemes, theme);
  applyTheme(document.documentElement, theme, isDarkTheme);
  updateThemeColor(theme);

  if (document.body) {
    applyTheme(document.body, theme, isDarkTheme);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      applyTheme(document.body, theme, isDarkTheme);
    }, { once: true });
  }
})();