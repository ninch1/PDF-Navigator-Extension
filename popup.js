const DEFAULT_SETTINGS = {
  highlightColor: "#ffa500",
  borderThickness: 2,
};

const colorInput = document.getElementById("highlightColor");
const thicknessInput = document.getElementById("borderThickness");
const thicknessValue = document.getElementById("borderThicknessValue");

function saveSettings() {
  const settings = {
    highlightColor: colorInput.value,
    borderThickness: Number(thicknessInput.value),
  };

  chrome.storage.local.set(settings);
}

function updateThicknessLabel() {
  thicknessValue.textContent = `${thicknessInput.value}px`;
}

chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
  colorInput.value = settings.highlightColor;
  thicknessInput.value = settings.borderThickness;
  updateThicknessLabel();
});

colorInput.addEventListener("input", saveSettings);
thicknessInput.addEventListener("input", () => {
  updateThicknessLabel();
  saveSettings();
});
