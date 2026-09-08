export interface Question {
  id: string;
  category: string;
  question: string;
  correctAnswer: string;
}

export const QUESTIONS: Question[] = [
  {
    id: "q01",
    category: "Science",
    question: "What planet has the most confirmed moons in our solar system?",
    correctAnswer: "Saturn"
  },
  {
    id: "q02",
    category: "History",
    question: "What ancient material was made from the papyrus plant?",
    correctAnswer: "Paper"
  },
  {
    id: "q03",
    category: "Food",
    question: "What ingredient makes bread rise?",
    correctAnswer: "Yeast"
  },
  {
    id: "q04",
    category: "Geography",
    question: "Which country has the city of Kyoto?",
    correctAnswer: "Japan"
  },
  {
    id: "q05",
    category: "Music",
    question: "How many strings does a standard violin have?",
    correctAnswer: "Four"
  },
  {
    id: "q06",
    category: "Sports",
    question: "In tennis, what score comes after deuce?",
    correctAnswer: "Advantage"
  },
  {
    id: "q07",
    category: "Nature",
    question: "What gas do plants absorb during photosynthesis?",
    correctAnswer: "Carbon dioxide"
  },
  {
    id: "q08",
    category: "Movies",
    question: "What device projects a movie onto a screen?",
    correctAnswer: "Projector"
  },
  {
    id: "q09",
    category: "Language",
    question: "What punctuation mark ends a question?",
    correctAnswer: "Question mark"
  },
  {
    id: "q10",
    category: "Technology",
    question: "What does URL stand for?",
    correctAnswer: "Uniform Resource Locator"
  },
  {
    id: "q11",
    category: "Animals",
    question: "What is the fastest land animal?",
    correctAnswer: "Cheetah"
  },
  {
    id: "q12",
    category: "Space",
    question: "What galaxy contains Earth?",
    correctAnswer: "Milky Way"
  },
  {
    id: "q13",
    category: "Math",
    question: "What is the name for a polygon with eight sides?",
    correctAnswer: "Octagon"
  },
  {
    id: "q14",
    category: "Art",
    question: "What primary color mixes with blue to make green?",
    correctAnswer: "Yellow"
  },
  {
    id: "q15",
    category: "Games",
    question: "What piece moves in an L shape in chess?",
    correctAnswer: "Knight"
  }
];
