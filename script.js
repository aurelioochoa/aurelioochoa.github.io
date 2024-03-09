// import data from "./assets/technologies.json" assert { type: "json" };

function fade(element) {
  var op = 1;  // initial opacity
  var timer = setInterval(function () {
      if (op <= 0.1){
          clearInterval(timer);
          element.style.display = 'none';
      }
      element.style.opacity = op;
      element.style.filter = 'alpha(opacity=' + op * 100 + ")";
      op -= op * 0.1;
  }, 50);
}

function fadeIn (element) {
  var op = 0.1;  // initial opacity
  element.style.display = 'block';
  var timer = setInterval(function () {
      if (op >= 1){
          clearInterval(timer);
      }
      element.style.opacity = op;
      element.style.filter = 'alpha(opacity=' + op * 100 + ")";
      op += op * 0.1;
  }, 50);
}

const getUselessFact = async () => {
  const uselessfactsRandomFactEndpoint = "https://uselessfacts.jsph.pl/api/v2/facts/random";
  const response = await fetch(uselessfactsRandomFactEndpoint);
  const data = await response.json();
  document.getElementById("uselessfact").innerHTML = data.text;
}

function iconShelfModal () {
  const iconShelfClass = "icon-shelf";

  let dialog = document.createElement('dialog');
  let modalTitle = document.createElement('h1');
  let modalContent = document.createElement('div');

  const icons = getAllItalicElementsFromDivByClass(iconShelfClass);
  const iconShelf = document.getElementsByClassName(iconShelfClass)[0];
  const modal = iconShelf.appendChild(dialog);

  function getAllItalicElementsFromDivByClass(className) {
    var divElements = document.getElementsByClassName(className);  
    var italicElements = [];
  
    for (var i = 0; i < divElements.length; i++) {
      var italicsInDiv = divElements[i].getElementsByTagName('i');
      for (var j = 0; j < italicsInDiv.length; j++) {
          italicElements.push(italicsInDiv[j]);
      }
    }
  
    return italicElements;
  }

  function setModalByIcon(icons) { 
    icons.forEach(icon => {
      icon.addEventListener("click", () => {
        const title = icon.getAttribute('title');
        const content = icon.querySelector('template').innerHTML;
        modalTitle.textContent = title;
        modalContent.innerHTML = content;
        modal.appendChild(modalTitle);
        modal.appendChild(modalContent);
        modal.showModal();
      });
    });
  }

  function setCloseMethod() {
    if (!iconShelf.classList.contains('close-button')) {
      modal.addEventListener('click', event => {
        if (event.target === modal) {
          modal.close();
        }
      });
    } else {
      let closeButton = document.createElement('button');
      closeButton.classList.add('close');
      dialog.appendChild(closeButton);
      closeButton.addEventListener('click', () => modal.close());
    }
  }

  setModalByIcon(icons);
  setCloseMethod();
}

function timeline () {  
  const timeline = document.getElementsByClassName('timeline')[0];
  const timelineTemplates = timeline.getElementsByTagName('template');

  function createTimelineArray(timelineTemplates) {
    let timelineArray = [];

    for (let i = 0; i < timelineTemplates.length; i++) {
      let timelineTemplate = timelineTemplates[i];      
      let order = timelineTemplate.getAttribute('data-order');
      
      if (!order) continue;

      let TimelineItem = document.createElement('section');
      let timelineTitle = document.createElement('h1');
      let timelineSubtitle = document.createElement('h2');
      let timelineContent = document.createElement('div');
      
      let title = timelineTemplate.getAttribute('title');
      let subtitle = timelineTemplate.getAttribute('data-subtitle');
      let content = timelineTemplate.innerHTML;
  
      timelineTitle.textContent = title;
      timelineSubtitle.textContent = subtitle;
      timelineContent.innerHTML = content;
    
      TimelineItem.appendChild(timelineTitle);
      TimelineItem.appendChild(timelineSubtitle);
      TimelineItem.appendChild(timelineContent);

      timelineArray.push({
        order: order,
        HTMLElement: TimelineItem
      });

    }
    
    timelineArray.sort((a, b) => a.order - b.order);
    return timelineArray;
  }
  async function nextTimelineItem (timeline, timelineArray, delay = 9000) {
    while (true) {
      for (let i = 0; i < timelineArray.length; i++) {
        let timelineItem = timelineArray[i];
        let activeTimelineItem = timelineItem.HTMLElement;
        fadeIn(activeTimelineItem);
        timeline.appendChild(activeTimelineItem);
        await new Promise(r => setTimeout(r, delay));
        fade(activeTimelineItem);
        await new Promise(r => setTimeout(r, 1500));
        timeline.removeChild(timelineItem.HTMLElement);
      }
    }
  }

  const timelineArray = createTimelineArray(timelineTemplates);
  nextTimelineItem(timeline, timelineArray, 5000);
}

getUselessFact();
iconShelfModal();
timeline();